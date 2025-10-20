const OpenAI = require('openai');
const path = require('path');
const https = require('https');

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
      "category": string (MUST be one of: "Food", "Transport", "Shopping", "Bills", "Other")
    }
  ],
  "paymentMethod": string|null,
  "taxAmount": number|null,
  "tipAmount": number|null
}
Rules:
- Use null when a value is missing or unreadable.
- All monetary fields must be numbers (not strings).
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

  const systemPrompt = `You are "Finch", an empathetic financial coach living inside a budgeting app.
You study the provided JSON snapshot of the user's current expense data and offer concise, supportive insights.
Goals:
- Highlight notable changes in spending versus prior periods (weeks or months) when data is available.
- Surface category-level overages, savings opportunities, and budget adherence.
- Encourage the user with actionable, present-focused suggestions.
- Never claim certainty about the future or make forecasts; focus on observed trends.
- Keep responses under 180 words. Use short paragraphs or bullet lists for readability.
- Avoid generic financial advice or disclaimers. Sound like a friendly, expert coach.`;

  const analysisPayload = truncateMessageContent(JSON.stringify(analysis));

  if (provider === AI_PROVIDERS.STUB) {
    return {
      message: `Here is a quick snapshot based on your latest data:
- Total spending this period: $${analysis?.totals?.spending?.toFixed?.(2) ?? '—'}
- Biggest category: ${analysis?.categorySummary?.[0]?.categoryName ?? 'N/A'}
- Remaining budget overall: $${analysis?.totals?.remaining?.toFixed?.(2) ?? '—'}

Focus on categories that are approaching their budgets and celebrate the ones running under budget. Keep logging expenses so I can keep guiding you!`,
      usage: null
    };
  }

  const messages = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: `Here is the latest expense snapshot in JSON format:
\`\`\`json
${analysisPayload}
\`\`\`
Please use it for all of your guidance.`
    },
    ...sanitizedConversation
  ];

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

module.exports = {
  processReceiptWithAI,
  parseManualEntry,
  generateCoachInsights
};
