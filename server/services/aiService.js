const OpenAI = require('openai');
const path = require('path');
const https = require('https');
const axios = require('axios');

let sharp = null;
try {
  // sharp is optional; we'll use it when available to shrink large images
  // eslint-disable-next-line global-require
  sharp = require('sharp');
} catch (error) {
  console.warn('⚠️  sharp module not found. Large images will not be optimized automatically.');
}

let openai = null;

const AI_PROVIDERS = {
  DEEPSEEK: 'deepseek',
  OPENAI: 'openai',
  STUB: 'stub',
};

const VIEW_CONTEXT_DETAILS = {
  dashboard: {
    area: 'your dashboard overview',
    instruction: 'The user opened the coach from the dashboard; keep answers grounded in overall trends, comparisons, and the big picture.'
  },
  expenses: {
    area: 'your expenses',
    instruction: 'The user is viewing individual expenses; focus on transactions, recent activity, and spending totals.'
  },
  categories: {
    area: 'category spending',
    instruction: 'Highlight category-level habits, over/under spend, and notable shifts.'
  },
  manage: {
    area: 'your budgets and goals',
    instruction: 'Center the response on category budgets, remaining amounts, and goal progress.'
  },
  'income-savings': {
    area: 'income and savings',
    instruction: 'Emphasize income inflows, savings momentum, and goal tracking.'
  },
  log: {
    area: 'expense logging',
    instruction: 'Help them capture clean data—call out missing details, recent uploads, or data quality gaps.'
  },
  settings: {
    area: 'settings',
    instruction: 'Address preferences, notifications, and coach settings when relevant.'
  }
};

function initOpenAI() {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  return openai;
}

function resolveProvider() {
  const explicit = (process.env.AI_PROVIDER || '').toLowerCase();

  if (explicit === AI_PROVIDERS.DEEPSEEK && process.env.DEEPSEEK_API_KEY) {
    return AI_PROVIDERS.DEEPSEEK;
  }

  if (explicit === AI_PROVIDERS.OPENAI && process.env.OPENAI_API_KEY) {
    return AI_PROVIDERS.OPENAI;
  }

  if (explicit === AI_PROVIDERS.STUB || process.env.USE_STUB_AI === 'true') {
    return AI_PROVIDERS.STUB;
  }

  if (process.env.DEEPSEEK_API_KEY) {
    return AI_PROVIDERS.DEEPSEEK;
  }

  if (process.env.OPENAI_API_KEY) {
    return AI_PROVIDERS.OPENAI;
  }

  if (explicit === AI_PROVIDERS.STUB) {
    return AI_PROVIDERS.STUB;
  }

  return null;
}

function determineMimeTypeFromExtension(filename) {
  const fileExtension = path.extname(filename).toLowerCase();

  if (fileExtension === '.png') {
    return 'image/png';
  }
  if (fileExtension === '.jpg' || fileExtension === '.jpeg') {
    return 'image/jpeg';
  }
  if (fileExtension === '.pdf') {
    return 'application/pdf';
  }

  throw new Error('Unsupported file format');
}

async function prepareImageFromBuffer(imageBuffer, mimeType) {
  const maxDimension = parseInt(process.env.AI_IMAGE_MAX_DIMENSION || '1024', 10);
  const shouldOptimize =
    sharp &&
    mimeType !== 'application/pdf' &&
    Number.isFinite(maxDimension) &&
    maxDimension > 0;

  let processedBuffer = imageBuffer;
  let finalMimeType = mimeType;

  if (shouldOptimize) {
    try {
      processedBuffer = await sharp(imageBuffer)
        .rotate()
        .resize({
          width: maxDimension,
          height: maxDimension,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: parseInt(process.env.AI_IMAGE_JPEG_QUALITY || '75', 10) || 75 })
        .toBuffer();
      finalMimeType = 'image/jpeg';
    } catch (error) {
      console.warn('⚠️  Failed to optimize image with sharp:', error.message);
    }
  }

  const base64Image = processedBuffer.toString('base64');

  const maxPayloadSize = parseInt(process.env.AI_MAX_BASE64_LENGTH || '1200000', 10);
  if (Number.isFinite(maxPayloadSize) && base64Image.length > maxPayloadSize) {
    throw new Error(
      `Prepared image is still too large (${base64Image.length} bytes). Please use a smaller/optimized image.`
    );
  }

  return { base64Image, mimeType: finalMimeType };
}

function buildExtractionInstruction() {
  return `Extract this receipt and respond with a single JSON object ONLY (no markdown, no prose).
Required keys and value types:
{
  "merchantName": string,
  "date": "YYYY-MM-DD" or null,
  "totalAmount": number,
  "currency": currency code (default "USD"),
  "category": string (MUST be one of: "Food", "Transport", "Shopping", "Bills", "Other"),
  "items": [
    {
      "description": string,
      "quantity": number|null,
      "unitPrice": number|null,
      "totalPrice": number|null,
      "category": string (MUST be one of: "Food", "Transport", "Shopping", "Bills", "Other"),
      "barcode": string|null
    }
  ],
  "paymentMethod": string|null,
  "taxAmount": number|null,
  "tipAmount": number|null
}
Rules:
- Use null when a value is missing or unreadable.
- All monetary fields must be numbers (not strings).
- CRITICAL - PRICE ACCURACY:
  * Double-check that item prices match EXACTLY what's printed on the receipt
  * Verify that the sum of all item totalPrice values matches or is close to the final total
  * For multi-line items, make sure you're capturing the FINAL price on the right side, not SKU numbers or codes
  * If an item shows quantity × unit price, calculate: totalPrice = quantity × unitPrice
  * Common mistakes to avoid: Don't confuse product codes/SKU numbers with prices, don't miss decimal points
- BARCODE EXTRACTION:
  * Look for barcodes or UPC codes near product names (usually 12-13 digit numbers)
  * Common formats: UPC-A (12 digits), EAN-13 (13 digits), or shortened UPC codes
  * These often appear BEFORE the product name on receipts (especially Walmart, Target, grocery stores)
  * Extract ONLY the numeric barcode, no letters or special characters
  * If you see a pattern like "012345678901 PROD NAME", the first number is likely the barcode
- IMPORTANT: Each item MUST have its own category based on what the product is:
  * Food: Food items, beverages, groceries (e.g., "Coffee" = Food, "Sandwich" = Food)
  * Transport: Gas, fuel, parking fees, tolls, transit passes (e.g., "Gasoline" = Transport)
  * Shopping: Retail products, clothing, electronics, household items (e.g., "T-Shirt" = Shopping, "Phone Charger" = Shopping)
  * Bills: Utilities, phone bills, subscriptions (e.g., "Phone Bill" = Bills)
  * Other: Anything that doesn't fit the above categories
- The receipt-level category should represent the overall purchase.
- Categorize each item independently based on the product itself, not the merchant.
- Return ONLY the JSON object.`;
}

async function callOpenAI(base64Image, mimeType) {
  const openaiClient = initOpenAI();

  if (!openaiClient) {
    throw new Error('OpenAI API key not configured. Please add OPENAI_API_KEY to your .env file.');
  }

  const model = process.env.OPENAI_VISION_MODEL || 'gpt-4o';

  const response = await openaiClient.chat.completions.create({
    model: model,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: buildExtractionInstruction(),
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${base64Image}`,
            },
          },
        ],
      },
    ],
    max_tokens: 1000,
  });

  const extractedText = response.choices?.[0]?.message?.content;

  if (!extractedText) {
    throw new Error('OpenAI response did not contain any content');
  }

  return extractedText;
}

function callDeepSeek(base64Image, mimeType) {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    throw new Error('DeepSeek API key not configured. Please add DEEPSEEK_API_KEY to your .env file.');
  }

  const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
  const baseUrl = process.env.DEEPSEEK_API_BASE || 'https://api.deepseek.com';
  const url = new URL('/v1/chat/completions', baseUrl);

  const payload = JSON.stringify({
    model,
    messages: [
      {
        role: 'system',
        content: 'You extract structured expense data from receipts.',
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: buildExtractionInstruction(),
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${base64Image}`,
            },
          },
        ],
      },
    ],
    temperature: 0,
    max_tokens: 1000,
  });

  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        hostname: url.hostname,
        path: `${url.pathname}${url.search}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (response) => {
        let data = '';

        response.on('data', (chunk) => {
          data += chunk;
        });

        response.on('end', () => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`DeepSeek API error (${response.statusCode}): ${data}`));
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const extractedText = parsed.choices?.[0]?.message?.content;

            if (!extractedText) {
              reject(new Error('DeepSeek response did not contain any content'));
              return;
            }

            resolve(extractedText);
          } catch (parseError) {
            reject(new Error(`Failed to parse DeepSeek response: ${parseError.message}`));
          }
        });
      }
    );

    request.on('error', (error) => {
      reject(new Error(`DeepSeek request failed: ${error.message}`));
    });

    request.write(payload);
    request.end();
  });
}

function extractExpenseData(extractedText) {
  try {
    const jsonMatch = extractedText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error('No JSON found in AI response');
    }

    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error('Failed to parse AI response:', error);
    console.log('Raw AI response:', extractedText);
    throw new Error('Failed to parse expense data from receipt');
  }
}

/**
 * Look up product information using barcode
 * Tries multiple APIs in sequence until one returns results
 */
async function lookupProductByBarcode(barcode) {
  if (!barcode || typeof barcode !== 'string') {
    return null;
  }

  // Clean the barcode - remove any non-numeric characters
  const cleanBarcode = barcode.replace(/[^0-9]/g, '');

  if (cleanBarcode.length < 8 || cleanBarcode.length > 14) {
    console.log(`[Barcode] Invalid barcode length: ${cleanBarcode.length}`);
    return null;
  }

  console.log(`[Barcode] Looking up product for barcode: ${cleanBarcode}`);

  // Try OpenFoodFacts first (free, no API key required, good for food items)
  try {
    const offResponse = await axios.get(`https://world.openfoodfacts.org/api/v0/product/${cleanBarcode}.json`, {
      timeout: 5000,
      headers: {
        'User-Agent': 'ExpenseLogger/1.0 (https://github.com/expense-logger)'
      }
    });

    if (offResponse.data && offResponse.data.status === 1 && offResponse.data.product) {
      const product = offResponse.data.product;
      const productName = product.product_name || product.product_name_en || null;
      const brand = product.brands || null;

      if (productName) {
        const fullName = brand ? `${brand} ${productName}` : productName;
        console.log(`[Barcode] Found on OpenFoodFacts: ${fullName}`);
        return {
          name: fullName,
          brand: brand,
          source: 'OpenFoodFacts'
        };
      }
    }
  } catch (error) {
    console.log(`[Barcode] OpenFoodFacts lookup failed: ${error.message}`);
  }

  // Try UPCItemDB as fallback (requires API key but has free tier)
  if (process.env.UPCITEMDB_API_KEY) {
    try {
      const upcResponse = await axios.get(`https://api.upcitemdb.com/prod/trial/lookup?upc=${cleanBarcode}`, {
        timeout: 5000,
        headers: {
          'User-Agent': 'ExpenseLogger/1.0',
          'Key-Header': process.env.UPCITEMDB_API_KEY
        }
      });

      if (upcResponse.data && upcResponse.data.items && upcResponse.data.items.length > 0) {
        const item = upcResponse.data.items[0];
        const productName = item.title || null;
        const brand = item.brand || null;

        if (productName) {
          const fullName = brand ? `${brand} ${productName}` : productName;
          console.log(`[Barcode] Found on UPCItemDB: ${fullName}`);
          return {
            name: fullName,
            brand: brand,
            source: 'UPCItemDB'
          };
        }
      }
    } catch (error) {
      console.log(`[Barcode] UPCItemDB lookup failed: ${error.message}`);
    }
  }

  // Try Barcode Lookup API as another fallback
  if (process.env.BARCODELOOKUP_API_KEY) {
    try {
      const blResponse = await axios.get(`https://api.barcodelookup.com/v3/products`, {
        timeout: 5000,
        params: {
          barcode: cleanBarcode,
          key: process.env.BARCODELOOKUP_API_KEY
        }
      });

      if (blResponse.data && blResponse.data.products && blResponse.data.products.length > 0) {
        const product = blResponse.data.products[0];
        const productName = product.product_name || product.title || null;
        const brand = product.brand || null;

        if (productName) {
          const fullName = brand ? `${brand} ${productName}` : productName;
          console.log(`[Barcode] Found on BarcodeLookup: ${fullName}`);
          return {
            name: fullName,
            brand: brand,
            source: 'BarcodeLookup'
          };
        }
      }
    } catch (error) {
      console.log(`[Barcode] BarcodeLookup API failed: ${error.message}`);
    }
  }

  console.log(`[Barcode] No product found for barcode: ${cleanBarcode}`);
  return null;
}

/**
 * Enhance item descriptions using barcode lookup
 * Replaces shortened names with full product names from barcode databases
 */
async function enhanceItemsWithBarcodes(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return items;
  }

  console.log(`[Barcode] Enhancing ${items.length} items with barcode lookups...`);

  const enhancedItems = await Promise.all(
    items.map(async (item) => {
      if (!item || !item.barcode) {
        return item;
      }

      try {
        const productInfo = await lookupProductByBarcode(item.barcode);

        if (productInfo && productInfo.name) {
          const originalDescription = item.description || 'Unknown';
          console.log(`[Barcode] Enhanced: "${originalDescription}" -> "${productInfo.name}"`);

          return {
            ...item,
            description: productInfo.name,
            originalDescription: originalDescription, // Keep original for reference
            brand: productInfo.brand || item.brand || null,
            barcodeSource: productInfo.source
          };
        }
      } catch (error) {
        console.error(`[Barcode] Error enhancing item with barcode ${item.barcode}:`, error.message);
      }

      return item;
    })
  );

  const enhancedCount = enhancedItems.filter(item => item.barcodeSource).length;
  console.log(`[Barcode] Successfully enhanced ${enhancedCount} out of ${items.length} items`);

  return enhancedItems;
}

async function processReceiptWithAI(fileBuffer, originalFilename, providedMimeType) {
  try {
    const provider = resolveProvider();

    console.log(`[AI] Using provider: ${provider}`);

    if (!provider) {
      throw new Error('No AI provider configured. Set DEEPSEEK_API_KEY, OPENAI_API_KEY, or use AI_PROVIDER=stub for local testing.');
    }

    if (provider === AI_PROVIDERS.STUB) {
      console.warn('⚠️  Using stub AI provider. Returned data is static and for testing only.');

      // Get current date in local timezone for stub
      const now = new Date();
      const todayDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      return {
        merchantName: 'Sample Coffee Shop',
        date: todayDateStr,
        totalAmount: 11.5,
        currency: 'USD',
        category: 'Food',
        items: [
          {
            description: 'Latte',
            quantity: 1,
            unitPrice: 4.5,
            totalPrice: 4.5,
            category: 'Food'
          },
          {
            description: 'Blueberry Muffin',
            quantity: 1,
            unitPrice: 3.5,
            totalPrice: 3.5,
            category: 'Food'
          },
          {
            description: 'Sparkling Water',
            quantity: 1,
            unitPrice: 2.0,
            totalPrice: 2.0,
            category: 'Food'
          },
        ],
        paymentMethod: 'Credit Card',
        taxAmount: 0.8,
        tipAmount: 0.7,
      };
    }

    // Use provided mime type or determine from filename
    const mimeType = providedMimeType || determineMimeTypeFromExtension(originalFilename);

    const { base64Image, mimeType: finalMimeType } = await prepareImageFromBuffer(fileBuffer, mimeType);

    const extractedText = provider === AI_PROVIDERS.DEEPSEEK
      ? await callDeepSeek(base64Image, finalMimeType)
      : await callOpenAI(base64Image, finalMimeType);

    if (process.env.AI_DEBUG_LOG === 'true') {
      console.log('[AI][debug] Raw response:', extractedText);
    }

    const expenseData = extractExpenseData(extractedText);

    validateExpenseData(expenseData);

    if (process.env.AI_DEBUG_LOG === 'true') {
      console.log('[AI][debug] Validated expense data:', expenseData);
    }

    // Enhance item descriptions with barcode lookups
    if (expenseData.items && expenseData.items.length > 0) {
      const enableBarcodeLookup = process.env.ENABLE_BARCODE_LOOKUP !== 'false'; // Enabled by default

      if (enableBarcodeLookup) {
        try {
          expenseData.items = await enhanceItemsWithBarcodes(expenseData.items);
          console.log('[AI] Barcode enhancement completed');
        } catch (error) {
          console.warn('[AI] Barcode enhancement failed, continuing without it:', error.message);
          // Don't fail the whole process if barcode lookup fails
        }
      } else {
        console.log('[AI] Barcode lookup disabled via environment variable');
      }
    }

    return expenseData;

  } catch (error) {
    console.error('AI processing error:', error);
    throw new Error(`AI processing failed: ${error.message}`);
  }
}

function validateExpenseData(data) {
  const normalizeNumber = (value) => {
    if (value === undefined || value === null || value === '') {
      return null;
    }

    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }

    if (typeof value === 'string') {
      const cleaned = value
        .replace(/[^0-9,.-]/g, '')
        .replace(/,(?=\d{3}(?:\D|$))/g, '')
        .replace(/,/g, '.');

      const parsed = parseFloat(cleaned);
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  };

  if (!data.merchantName || data.merchantName === '') {
    console.warn('AI response missing merchantName; defaulting to "Unknown Merchant"');
    data.merchantName = 'Unknown Merchant';
  }

  if (data.totalAmount === undefined || data.totalAmount === null || data.totalAmount === '') {
    const fallbackKeys = ['total', 'total_amount', 'amount', 'grandTotal', 'totalWithTax'];

    for (const key of fallbackKeys) {
      if (data[key] !== undefined && data[key] !== null && data[key] !== '') {
        data.totalAmount = data[key];
        break;
      }
    }
  }

  // Coerce numeric fields that might arrive as strings
  const numericFields = ['totalAmount', 'taxAmount', 'tipAmount'];
  numericFields.forEach((field) => {
    if (data[field] !== undefined && data[field] !== null && data[field] !== '') {
      const coerced = normalizeNumber(data[field]);
      if (coerced !== null) {
        data[field] = coerced;
      }
    }
  });

  if (typeof data.totalAmount !== 'number' || !Number.isFinite(data.totalAmount) || data.totalAmount <= 0) {
    if (Array.isArray(data.items) && data.items.length > 0) {
      const fallbackTotal = data.items.reduce((sum, item) => {
        if (!item || typeof item !== 'object') {
          return sum;
        }

        const totalPrice = normalizeNumber(item.totalPrice);
        if (totalPrice !== null && totalPrice > 0) {
          return sum + totalPrice;
        }

        const unitPrice = normalizeNumber(item.unitPrice);
        const quantity = normalizeNumber(item.quantity);
        if (unitPrice !== null && quantity !== null && unitPrice > 0 && quantity > 0) {
          return sum + unitPrice * quantity;
        }

        return sum;
      }, 0);

      if (fallbackTotal > 0) {
        console.warn('AI response had invalid totalAmount; using computed sum of items instead.');
        data.totalAmount = parseFloat(fallbackTotal.toFixed(2));
      }
    }

    if (typeof data.totalAmount !== 'number' || !Number.isFinite(data.totalAmount) || data.totalAmount <= 0) {
      throw new Error('Total amount must be a positive number');
    }
  }

  if (Array.isArray(data.items)) {
    data.items = data.items.map((item) => {
      if (!item || typeof item !== 'object') {
        return item;
      }

      const coercedItem = { ...item };

      ['quantity', 'unitPrice', 'totalPrice'].forEach((field) => {
        if (coercedItem[field] !== undefined && coercedItem[field] !== null && coercedItem[field] !== '') {
          const coerced = normalizeNumber(coercedItem[field]);
          if (coerced !== null) {
            coercedItem[field] = coerced;
          }
        }
      });

      // Categorize item if missing or invalid category
      const validCategories = ['Food', 'Transport', 'Shopping', 'Bills', 'Other'];
      if (!coercedItem.category || !validCategories.includes(coercedItem.category)) {
        coercedItem.category = categorizeItem(coercedItem.description);
      }

      return coercedItem;
    });
  }

  if (data.date && !isValidDate(data.date)) {
    console.warn('Invalid date format, setting to null');
    data.date = null;
  }

  if (!data.currency) {
    data.currency = 'USD';
  }

  // Validate and normalize category
  const validCategories = ['Food', 'Transport', 'Shopping', 'Bills', 'Other'];

  if (!data.category || !validCategories.includes(data.category)) {
    // Smart categorization fallback based on merchant name and items
    data.category = smartCategorize(data.merchantName, data.items);
    console.warn(`Invalid or missing category, using smart categorization: ${data.category}`);
  }
}

// Categorize individual item based on its description
function categorizeItem(description) {
  const itemText = (description || '').toLowerCase();

  // Food item keywords
  const foodItemKeywords = [
    'coffee', 'latte', 'cappuccino', 'espresso', 'tea', 'juice', 'soda', 'water', 'milk',
    'sandwich', 'burger', 'pizza', 'pasta', 'salad', 'soup', 'bread', 'muffin', 'bagel',
    'donut', 'cookie', 'cake', 'pie', 'ice cream', 'yogurt', 'cheese', 'meat', 'chicken',
    'beef', 'pork', 'fish', 'seafood', 'vegetable', 'fruit', 'apple', 'banana', 'orange',
    'snack', 'chips', 'candy', 'chocolate', 'cereal', 'rice', 'beans', 'egg', 'breakfast',
    'lunch', 'dinner', 'meal', 'entree', 'appetizer', 'dessert', 'drink', 'beverage'
  ];

  // Transport item keywords
  const transportItemKeywords = [
    'gas', 'gasoline', 'fuel', 'diesel', 'petrol', 'parking', 'toll', 'fare', 'ticket',
    'ride', 'trip', 'mileage', 'car wash', 'oil change'
  ];

  // Shopping item keywords
  const shoppingItemKeywords = [
    'shirt', 't-shirt', 'pants', 'jeans', 'dress', 'skirt', 'shoes', 'socks', 'jacket',
    'coat', 'hat', 'gloves', 'underwear', 'bra', 'phone', 'charger', 'cable', 'case',
    'laptop', 'computer', 'tablet', 'headphones', 'speaker', 'tv', 'camera', 'watch',
    'book', 'toy', 'game', 'furniture', 'lamp', 'rug', 'curtain', 'pillow', 'blanket',
    'tool', 'hardware', 'paint', 'battery', 'light bulb', 'cleaning', 'detergent',
    'shampoo', 'soap', 'toothpaste', 'cosmetics', 'makeup', 'perfume', 'vitamin',
    'medicine', 'prescription', 'bandage'
  ];

  // Bills item keywords
  const billsItemKeywords = [
    'electric', 'electricity', 'power', 'water', 'utility', 'internet', 'wifi',
    'cable', 'phone', 'mobile', 'wireless', 'subscription', 'membership', 'insurance',
    'rent', 'lease', 'service fee', 'monthly fee', 'annual fee'
  ];

  // Check each category
  if (foodItemKeywords.some(keyword => itemText.includes(keyword))) {
    return 'Food';
  }

  if (transportItemKeywords.some(keyword => itemText.includes(keyword))) {
    return 'Transport';
  }

  if (shoppingItemKeywords.some(keyword => itemText.includes(keyword))) {
    return 'Shopping';
  }

  if (billsItemKeywords.some(keyword => itemText.includes(keyword))) {
    return 'Bills';
  }

  return 'Other';
}

// Smart categorization based on merchant name and items
function smartCategorize(merchantName, items) {
  const name = (merchantName || '').toLowerCase();
  const itemsText = Array.isArray(items)
    ? items.map(item => (item.description || '')).join(' ').toLowerCase()
    : '';

  const combined = `${name} ${itemsText}`;

  // Food keywords
  const foodKeywords = [
    'restaurant', 'cafe', 'coffee', 'pizza', 'burger', 'food', 'kitchen',
    'grill', 'bistro', 'diner', 'bakery', 'bar', 'pub', 'grocery', 'market',
    'deli', 'sushi', 'thai', 'chinese', 'mexican', 'indian', 'steakhouse',
    'seafood', 'bbq', 'taco', 'sandwich', 'donut', 'ice cream', 'smoothie',
    'juice', 'starbucks', 'mcdonald', 'subway', 'chipotle', 'panera',
    'whole foods', 'trader joe', 'safeway', 'kroger', 'walmart'
  ];

  // Transport keywords
  const transportKeywords = [
    'gas', 'fuel', 'chevron', 'shell', 'exxon', 'bp', 'mobil', 'parking',
    'uber', 'lyft', 'taxi', 'transit', 'metro', 'bus', 'train', 'airline',
    'airport', 'rental', 'hertz', 'enterprise', 'toll', 'bridge'
  ];

  // Shopping keywords
  const shoppingKeywords = [
    'store', 'shop', 'retail', 'mall', 'amazon', 'target', 'best buy',
    'clothing', 'apparel', 'fashion', 'boutique', 'department', 'electronics',
    'home depot', 'lowes', 'ikea', 'furniture', 'pharmacy', 'cvs', 'walgreens'
  ];

  // Bills keywords
  const billsKeywords = [
    'utility', 'utilities', 'electric', 'power', 'water', 'gas company',
    'internet', 'cable', 'phone', 'wireless', 'verizon', 'at&t', 't-mobile',
    'comcast', 'spectrum', 'insurance', 'subscription', 'netflix', 'spotify',
    'rent', 'lease', 'property management'
  ];

  // Check each category
  if (foodKeywords.some(keyword => combined.includes(keyword))) {
    return 'Food';
  }

  if (transportKeywords.some(keyword => combined.includes(keyword))) {
    return 'Transport';
  }

  if (shoppingKeywords.some(keyword => combined.includes(keyword))) {
    return 'Shopping';
  }

  if (billsKeywords.some(keyword => combined.includes(keyword))) {
    return 'Bills';
  }

  return 'Other';
}

function isValidDate(dateString) {
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date);
}

// Parse natural language expense entry
async function parseManualEntry(textEntry) {
  try {
    const provider = resolveProvider();

    console.log(`[AI] Parsing manual entry with provider: ${provider}`);

    if (!provider) {
      console.warn('[AI] No provider configured; using fallback manual entry parser.');
      const fallbackExpenses = fallbackManualEntry(textEntry);
      if (fallbackExpenses) {
        return fallbackExpenses;
      }
      throw new Error('No AI provider configured');
    }

    if (provider === AI_PROVIDERS.STUB) {
      // Get current date in local timezone for stub
      const now = new Date();
      const todayDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      // Return mock data for testing
      return [{
        merchantName: 'Manual Entry',
        date: todayDateStr,
        totalAmount: 30,
        currency: 'USD',
        category: 'Food',
        items: [{
          description: 'Food items',
          quantity: 1,
          unitPrice: 10,
          totalPrice: 10,
          category: 'Food'
        }, {
          description: 'Shopping items',
          quantity: 1,
          unitPrice: 20,
          totalPrice: 20,
          category: 'Shopping'
        }],
        paymentMethod: 'Manual Entry',
        taxAmount: null,
        tipAmount: null
      }];
    }

    // Get current date in local timezone
    const now = new Date();
    const todayDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const currentYear = now.getFullYear();
    const currentMonth = now.toLocaleDateString('en-US', { month: 'long' });

    const prompt = `Parse this expense entry and extract individual expenses. Return a JSON array of expense objects.

TODAY'S DATE: ${todayDateStr} (${currentMonth} ${now.getDate()}, ${currentYear})
IMPORTANT: If a date is mentioned like "Oct 10" or "October 10", assume it means ${currentYear}, not a past year.

User entry: "${textEntry}"

Return format (JSON array):
[
  {
    "description": "brief description of what was purchased",
    "amount": number,
    "category": "Food" | "Transport" | "Shopping" | "Bills" | "Other",
    "merchantName": "merchant/store name if mentioned, or 'Manual Entry'",
    "date": "YYYY-MM-DD or null if not mentioned"
  }
]

Rules:
- Extract all expenses mentioned in the text
- Each expense should be a separate object in the array
- Categorize based on: Food (food/dining), Transport (gas/parking/transit), Shopping (retail/clothing/electronics), Bills (utilities/subscriptions), Other (miscellaneous)
- If a date like "Oct 10" or "few days ago" is mentioned, calculate based on today's date (${todayDateStr}) and use ${currentYear}
- If no specific date mentioned, use null
- Amount must be a number
- Return ONLY the JSON array, no markdown or explanatory text`;

    let responseText;

    if (provider === AI_PROVIDERS.OPENAI) {
      const openaiClient = initOpenAI();
      if (!openaiClient) {
        throw new Error('OpenAI not configured');
      }

      const response = await openaiClient.chat.completions.create({
        model: process.env.OPENAI_VISION_MODEL || 'gpt-4o',
        messages: [
          { role: 'user', content: prompt }
        ],
        max_tokens: 500
      });

      responseText = response.choices?.[0]?.message?.content;
    } else if (provider === AI_PROVIDERS.DEEPSEEK) {
      const apiKey = process.env.DEEPSEEK_API_KEY;
      const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
      const baseUrl = process.env.DEEPSEEK_API_BASE || 'https://api.deepseek.com';
      const url = new URL('/v1/chat/completions', baseUrl);

      const payload = JSON.stringify({
        model,
        messages: [
          { role: 'user', content: prompt }
        ],
        temperature: 0,
        max_tokens: 500
      });

      responseText = await new Promise((resolve, reject) => {
        const request = https.request(
          {
            hostname: url.hostname,
            path: `${url.pathname}${url.search}`,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
              'Content-Length': Buffer.byteLength(payload)
            }
          },
          (response) => {
            let data = '';
            response.on('data', (chunk) => { data += chunk; });
            response.on('end', () => {
              if (response.statusCode < 200 || response.statusCode >= 300) {
                reject(new Error(`DeepSeek API error: ${data}`));
                return;
              }
              try {
                const parsed = JSON.parse(data);
                resolve(parsed.choices?.[0]?.message?.content);
              } catch (err) {
                reject(new Error('Failed to parse DeepSeek response'));
              }
            });
          }
        );
        request.on('error', (error) => reject(error));
        request.write(payload);
        request.end();
      });
    }

    if (!responseText) {
      throw new Error('No response from AI');
    }

    if (process.env.AI_DEBUG_LOG === 'true') {
      console.log('[AI][debug] Manual entry parse response:', responseText);
    }

    // Extract JSON array from response
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('No JSON array found in AI response');
    }

    const parsedExpenses = JSON.parse(jsonMatch[0]);

    // If multiple items, combine them into a single expense with multiple items
    if (parsedExpenses.length === 0) {
      throw new Error('No expenses parsed from text');
    }

    const validCategories = ['Food', 'Transport', 'Shopping', 'Bills', 'Other'];

    // Combine all parsed expenses into items of a single expense
    const items = parsedExpenses.map(exp => {
      const category = exp.category || 'Other';
      return {
        description: exp.description || 'Manual entry',
        quantity: 1,
        unitPrice: parseFloat(exp.amount) || 0,
        totalPrice: parseFloat(exp.amount) || 0,
        category: validCategories.includes(category) ? category : categorizeItem(exp.description)
      };
    });

    // Calculate total amount from all items
    const totalAmount = items.reduce((sum, item) => sum + item.totalPrice, 0);

    // Determine overall category based on items
    const categoryCount = {};
    items.forEach(item => {
      categoryCount[item.category] = (categoryCount[item.category] || 0) + 1;
    });
    const dominantCategory = Object.keys(categoryCount).reduce((a, b) =>
      categoryCount[a] > categoryCount[b] ? a : b
    );

    // Get merchant name from first item if specified, otherwise use "Manual Entry"
    const merchantName = parsedExpenses[0].merchantName && parsedExpenses[0].merchantName !== 'Manual Entry'
      ? parsedExpenses[0].merchantName
      : 'Manual Entry';

    // Get date from parsed expense or use today's date in local timezone
    const expenseDate = parsedExpenses[0].date || todayDateStr;

    // Return a single expense with all items
    return [{
      merchantName: merchantName,
      date: expenseDate,
      totalAmount: parseFloat(totalAmount.toFixed(2)),
      currency: 'USD',
      category: dominantCategory,
      items: items,
      paymentMethod: 'Manual Entry',
      taxAmount: null,
      tipAmount: null
    }];

  } catch (error) {
    console.error('Manual entry parsing error:', error);
    throw new Error(`Failed to parse manual entry: ${error.message}`);
  }
}

function truncateMessageContent(content, maxLength = 4000) {
  if (typeof content !== 'string') {
    return '';
  }

  if (content.length <= maxLength) {
    return content;
  }

  return `${content.slice(0, maxLength)}…`;
}

async function generateCoachInsights({ conversation = [], analysis }) {
  const provider = resolveProvider();

  if (!provider) {
    throw new Error('No AI provider configured. Please set OPENAI_API_KEY, DEEPSEEK_API_KEY, or AI_PROVIDER=stub.');
  }

  if (!analysis) {
    throw new Error('Analysis payload is required for coach insights.');
  }

  const sanitizedConversation = Array.isArray(conversation)
    ? conversation
        .filter(message => message && typeof message.content === 'string')
        .slice(-10)
        .map(message => ({
          role: message.role === 'assistant' ? 'assistant' : 'user',
          content: truncateMessageContent(message.content)
        }))
    : [];

  const viewContext = analysis?.context?.activeView || null;
  const viewDetails = viewContext ? (VIEW_CONTEXT_DETAILS[viewContext] || null) : null;

  const systemPrompt = `You are "Finch", an empathetic financial coach living inside a budgeting app with deep memory of user expenses.
You receive a comprehensive JSON snapshot containing:
- Complete transaction history with dates, merchants, amounts, categories, and individual items
- Recent expenses (last 50) with full details
- Category budgets, spending totals, and comparisons
- Merchant patterns and spending trends
- All-time spending statistics

Treat this data as your single source of truth.

Core principles:
- You have access to ACTUAL expense data - use it! When asked about totals, merchants, or specific spending, reference the exact data.
- Answer only the specific question the user asked; skip broad dashboards or unrelated summaries unless they explicitly request them.
- Pull concrete numbers, comparisons, or patterns from the snapshot that directly support your answer.
- When asked about totals or spending, check recentExpenses array for specific transactions and amounts.
- If the data cannot answer the question, say so briefly and point them to the closest metric or a practical next step.
- Skip greetings or sign-offs unless the user uses them—jump straight into helpful guidance.
- Keep responses under 120 words. Vary sentence structure so the reply feels conversational, not templated.
- Match the requested coach mood in your tone while staying constructive.
- Ask for clarification when the question is ambiguous, and never speculate beyond the provided data.`;

  const analysisPayload = truncateMessageContent(JSON.stringify(analysis));
  const moodPreference = analysis?.preferences?.mood || 'motivator_serious';
  const moodInstructions = {
    motivator_roast: 'Tone: playful and candid—deliver the answer with a witty nudge while staying helpful and specific.',
    motivator_serious: 'Tone: steady, encouraging, and professional—focus on clarity and actionable guidance.'
  };
  const personaInstruction = moodInstructions[moodPreference] || moodInstructions.motivator_serious;

  if (provider === AI_PROVIDERS.STUB) {
    const areaLabel = viewDetails?.area || 'your finances';
    const formatCurrency = (value) => {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        return '$0.00';
      }
      return `$${numeric.toFixed(2)}`;
    };

    const totalSpending = Number(analysis?.totals?.spending ?? 0);
    const expenseCount = Number(analysis?.expenseCount ?? 0);
    const averageExpense = Number(analysis?.totals?.average ?? 0);
    const budgetDelta = Number(analysis?.totals?.deltaVsBudget ?? 0);

    const categorySummary = Array.isArray(analysis?.categorySummary)
      ? analysis.categorySummary
      : [];

    const topCategory = categorySummary.reduce((best, current) => {
      if (!current || typeof current.spent !== 'number') {
        return best;
      }
      if (!best || current.spent > best.spent) {
        return current;
      }
      return best;
    }, null);

    const patterns = analysis?.spendingPatterns || {};
    const topMerchant = Array.isArray(patterns.topMerchants) ? patterns.topMerchants[0] : null;
    const mostActiveDay = patterns?.mostActiveDay || null;

    const lastUserMessage = sanitizedConversation
      .filter(message => message.role === 'user')
      .pop()?.content?.trim();

    if (!lastUserMessage) {
      return {
        message: `I'm ready whenever you have a question about ${areaLabel}.`,
        usage: null
      };
    }

    const question = lastUserMessage.toLowerCase();
    const responseParts = [];
    const recentExpenses = Array.isArray(analysis?.recentExpenses) ? analysis.recentExpenses : [];
    const allExpenses = analysis?.allExpenses || {};

    // Check for total/grand total questions
    if (question.includes('total') || question.includes('grand total')) {
      if (question.includes('month') || question.includes('this month')) {
        responseParts.push(
          `Your total spending this month is ${formatCurrency(totalSpending)} across ${expenseCount} expenses.`
        );
        if (topCategory) {
          responseParts.push(
            `${topCategory.categoryName} is your biggest category at ${formatCurrency(topCategory.spent)}.`
          );
        }
      } else if (question.includes('all time') || question.includes('ever')) {
        responseParts.push(
          `All-time, you've logged ${allExpenses.total || 0} expenses totaling ${formatCurrency(allExpenses.totalAllTime || 0)}.`
        );
      } else {
        responseParts.push(
          `Your total spending this period is ${formatCurrency(totalSpending)}.`
        );
      }
    } else if (question.includes('budget') || question.includes('goal')) {
      if (Number.isFinite(budgetDelta) && budgetDelta !== 0) {
        responseParts.push(
          budgetDelta > 0
            ? `You're under budget by ${formatCurrency(Math.abs(budgetDelta))} overall.`
            : `You're over budget by ${formatCurrency(Math.abs(budgetDelta))} overall.`
        );
      }
      if (topCategory && Number.isFinite(topCategory.remaining)) {
        responseParts.push(
          topCategory.remaining >= 0
            ? `${topCategory.categoryName} still has ${formatCurrency(topCategory.remaining)} left.`
            : `${topCategory.categoryName} is over by ${formatCurrency(Math.abs(topCategory.remaining))}.`
        );
      }
    } else if (question.includes('category')) {
      if (topCategory) {
        responseParts.push(
          `${topCategory.categoryName} is leading at ${formatCurrency(topCategory.spent)} this period.`
        );
        if (Number.isFinite(topCategory.budget) && topCategory.budget > 0) {
          const remaining = Number(topCategory.remaining ?? 0);
          responseParts.push(
            remaining >= 0
              ? `You've used ${formatCurrency(topCategory.spent)} of the ${formatCurrency(topCategory.budget)} budget.`
              : `That's ${formatCurrency(Math.abs(remaining))} over its ${formatCurrency(topCategory.budget)} budget.`
          );
        }
      }
      if (mostActiveDay) {
        responseParts.push(`Spending peaks on ${mostActiveDay}s right now.`);
      }
    } else if (question.includes('merchant') || question.includes('store')) {
      if (topMerchant) {
        const merchantTotal = Number(topMerchant.total ?? topMerchant.totalSpent ?? 0);
        responseParts.push(
          `${topMerchant.name} is your most visited spot with ${topMerchant.count || 0} purchases totaling ${formatCurrency(merchantTotal)}.`
        );
      } else {
        responseParts.push("I don't see a clear top merchant in this snapshot.");
      }
    } else if (question.includes('recent') || question.includes('last')) {
      if (recentExpenses.length > 0) {
        const lastExpense = recentExpenses[0];
        responseParts.push(
          `Your most recent expense was ${formatCurrency(lastExpense.amount)} at ${lastExpense.merchant} on ${lastExpense.date}.`
        );
        if (recentExpenses.length > 1) {
          const last5Total = recentExpenses.slice(0, 5).reduce((sum, exp) => sum + exp.amount, 0);
          responseParts.push(`Your last 5 expenses total ${formatCurrency(last5Total)}.`);
        }
      } else {
        responseParts.push("No recent expenses found.");
      }
    } else if (question.includes('income') || question.includes('saving')) {
      responseParts.push(
        `I don't see dedicated income tracking here yet, but total spending sits at ${formatCurrency(totalSpending)} across ${expenseCount} expenses.`
      );
    } else {
      responseParts.push(
        `You've logged ${expenseCount} expenses totaling ${formatCurrency(totalSpending)} so far.`
      );
      if (topCategory) {
        responseParts.push(
          `${topCategory.categoryName} accounts for ${formatCurrency(topCategory.spent)}, and the average transaction lands around ${formatCurrency(averageExpense)}.`
        );
      }
    }

    if (!responseParts.length) {
      responseParts.push("I don't have enough data to answer that yet—try syncing more expenses.");
    }

    return {
      message: responseParts.join(' '),
      usage: null
    };
  }

  const viewInstruction = viewDetails
    ? `The user is currently focused on ${viewDetails.area}. ${viewDetails.instruction}`
    : null;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'system', content: `Persona guidelines: ${personaInstruction}` },
  ];

  if (viewInstruction) {
    messages.push({ role: 'system', content: viewInstruction });
  }

  messages.push({
    role: 'user',
    content: `Here is the latest expense snapshot in JSON format:
\`\`\`json
${analysisPayload}
\`\`\`
Please use it for all of your guidance.`
  });

  messages.push(...sanitizedConversation);

  if (provider === AI_PROVIDERS.OPENAI) {
    const openaiClient = initOpenAI();
    if (!openaiClient) {
      throw new Error('OpenAI API key not configured.');
    }

    const model = process.env.OPENAI_COACH_MODEL || 'gpt-4o-mini';
    const response = await openaiClient.chat.completions.create({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 600,
    });

    const content = response.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('AI coach response was empty.');
    }

    return {
      message: content.trim(),
      usage: response.usage || null
    };
  }

  if (provider === AI_PROVIDERS.DEEPSEEK) {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new Error('DeepSeek API key not configured.');
    }

    const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
    const baseUrl = process.env.DEEPSEEK_API_BASE || 'https://api.deepseek.com';
    const url = new URL('/v1/chat/completions', baseUrl);
    const payload = JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 600
    });

    const responseText = await new Promise((resolve, reject) => {
      const request = https.request(
        {
          hostname: url.hostname,
          path: `${url.pathname}${url.search}`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            'Content-Length': Buffer.byteLength(payload),
          },
        },
        (response) => {
          let data = '';

          response.on('data', (chunk) => {
            data += chunk;
          });

          response.on('end', () => {
            if (response.statusCode < 200 || response.statusCode >= 300) {
              reject(new Error(`DeepSeek API error (${response.statusCode}): ${data}`));
              return;
            }

            try {
              const parsed = JSON.parse(data);
              const extracted = parsed.choices?.[0]?.message?.content;
              if (!extracted) {
                reject(new Error('DeepSeek response did not contain any content'));
                return;
              }
              resolve(extracted.trim());
            } catch (parseError) {
              reject(new Error(`Failed to parse DeepSeek response: ${parseError.message}`));
            }
          });
        }
      );

      request.on('error', (error) => {
        reject(new Error(`DeepSeek request failed: ${error.message}`));
      });

      request.write(payload);
      request.end();
    });

    return {
      message: responseText,
      usage: null
    };
  }

  throw new Error(`Unsupported AI provider: ${provider}`);
}

function fallbackManualEntry(textEntry) {
  if (!textEntry || typeof textEntry !== 'string') {
    return null;
  }

  const segments = textEntry
    .split(/\n+|,|;/)
    .map(part => part.trim())
    .filter(Boolean);

  const items = [];

  segments.forEach(segment => {
    const amountMatch = segment.match(/(-?\$?\d+(?:\.\d+)?)/);
    if (!amountMatch) {
      return;
    }

    const rawAmount = amountMatch[0].replace(/\$/g, '');
    const amount = parseFloat(rawAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return;
    }

    let description = segment.replace(amountMatch[0], '').replace(/\$/g, '').trim();
    if (!description) {
      description = 'Manual item';
    }

    const category = smartCategorize(description);

    items.push({
      description,
      quantity: 1,
      unitPrice: amount,
      totalPrice: amount,
      category
    });
  });

  if (!items.length) {
    return null;
  }

  const totalAmount = items.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
  const merchantName = items.length === 1 ? items[0].description : 'Manual Entry';

  const now = new Date();
  const todayDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  return [{
    merchantName,
    date: todayDateStr,
    totalAmount: parseFloat(totalAmount.toFixed(2)),
    currency: 'USD',
    category: items.length === 1 ? items[0].category : smartCategorize(merchantName, items),
    items,
    paymentMethod: 'Manual Entry',
    taxAmount: null,
    tipAmount: null
  }];
}


module.exports = {
  processReceiptWithAI,
  parseManualEntry,
  generateCoachInsights
};
