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
  return `You are an expert receipt OCR system. Extract this receipt with EXTREME accuracy and respond with a single JSON object ONLY (no markdown, no prose).

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

CRITICAL RULES - READ CAREFULLY:

0. EXTRACTION INTEGRITY (MOST IMPORTANT - READ FIRST):
   ⚠️ NEVER ADJUST OR FABRICATE DATA TO MAKE TOTALS MATCH ⚠️
   * Extract ONLY what you can actually see and read on the receipt
   * Each line item must be read INDEPENDENTLY - do not let one item's price influence another
   * If you cannot read a price clearly:
     - Set totalPrice to null (preferred) or your best guess with low confidence
     - DO NOT adjust other prices to compensate
     - DO NOT make up prices to force the total to match
   * If the sum of items doesn't equal the total:
     - That's OK! The user can fix it in the review screen
     - DO NOT modify any prices you already extracted to fix the math
     - The review modal exists specifically to catch and fix OCR errors
   * HONESTY OVER ACCURACY: It's better to return null or an uncertain value than to fabricate data
   * Read the receipt line-by-line from top to bottom, treating each line independently
   * Example of CORRECT behavior:
     - If you see prices: 3.99, [blurry], 5.99, and total is 15.00
     - Return: 3.99, null, 5.99 (DO NOT calculate the middle price as 5.02)
   * Example of INCORRECT behavior:
     - Adjusting "3.99" to "4.99" because the total seems off
     - Calculating missing prices based on subtotal/total

0.5. RECEIPT STRUCTURE UNDERSTANDING (CRITICAL):
   ⚠️ UNDERSTAND THE DIFFERENCE BETWEEN LINE ITEMS AND SUMMARY TOTALS ⚠️

   A receipt has TWO distinct sections:

   SECTION 1 - ITEMIZED PRODUCTS (usually top/middle of receipt):
   * Individual products purchased (e.g., "MILK", "BREAD", "EGGS")
   * Each line has: [barcode?] PRODUCT NAME [quantity?] PRICE
   * These prices are typically small numbers (1.99, 5.49, 12.99, etc.)
   * Extract these into the "items" array

   SECTION 2 - SUMMARY TOTALS (usually bottom of receipt):
   * Bold or larger text showing: SUBTOTAL, TAX, FEES, TOTAL
   * These are SUMS, not individual products
   * DO NOT add these to the "items" array unless it's an actual fee/tax charge

   RULES FOR READING LINE ITEMS:
   * Process the receipt from top to bottom
   * When you encounter the itemized section (products list):
     - Add each product line to the "items" array
     - The price is the RIGHTMOST number on that line (usually 2 decimal places)
   * When you encounter summary section (subtotal/total):
     - STOP adding to "items" array
     - Extract only TAX, SERVICE FEE, TIP, DELIVERY FEE as special items
     - Use the TOTAL value for "totalAmount"
     - Ignore SUBTOTAL (it's just a sum, not a separate item)

   EXAMPLE - CORRECT EXTRACTION:
   Receipt shows:
   ---
   BREAD               2.49
   MILK                3.99
   EGGS                4.59

   SUBTOTAL           11.07
   TAX                 0.88
   TOTAL              11.95
   ---

   Correct JSON:
   {
     "totalAmount": 11.95,
     "items": [
       {"description": "Bread", "totalPrice": 2.49, ...},
       {"description": "Milk", "totalPrice": 3.99, ...},
       {"description": "Eggs", "totalPrice": 4.59, ...},
       {"description": "Tax", "totalPrice": 0.88, "category": "Other", ...}
     ]
   }

   WRONG - DO NOT DO THIS:
   {
     "totalAmount": 11.95,
     "items": [
       {"description": "Bread", "totalPrice": 2.49, ...},
       {"description": "Milk", "totalPrice": 3.99, ...},
       {"description": "Eggs", "totalPrice": 4.59, ...},
       {"description": "Subtotal", "totalPrice": 11.07, ...},  ❌ WRONG - Subtotal is not an item
       {"description": "Tax", "totalPrice": 0.88, ...},
       {"description": "Total", "totalPrice": 11.95, ...}      ❌ WRONG - Total is not an item
     ]
   }

   VISUAL CLUES TO IDENTIFY SECTIONS:
   * Itemized section: smaller text, aligned left, many lines, product names
   * Summary section: larger/bold text, words like "SUBTOTAL", "TAX", "TOTAL", fewer lines
   * The TOTAL line usually has the largest/boldest font

1. DATE EXTRACTION (HIGHEST PRIORITY):
   * Look for dates in these formats: MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD, Month DD YYYY
   * Check near: top of receipt, after merchant name, near time stamp, transaction info
   * Common patterns: "Date: 12/25/2024", "12-25-24", "Dec 25, 2024", "25/12/2024"
   * If day is ambiguous (e.g., 03/05/24), assume MM/DD/YYYY format (American style)
   * YEAR CONVERSION (CRITICAL): If you see 2-digit year (e.g., "24", "23", "25"):
     - Years 00-50 → assume 2000-2050 (e.g., "24" → 2024, "25" → 2025)
     - Years 51-99 → assume 1951-1999 (e.g., "95" → 1995)
     - Always output 4-digit year in format YYYY-MM-DD
     - Example: "12/25/24" → "2024-12-25", "01/15/25" → "2025-01-15"
   * VERIFY the year makes sense (receipts are usually recent, between 2020-2025)
   * If year seems wrong (e.g., 2004 when should be 2024), correct it
   * Return in YYYY-MM-DD format (e.g., "2024-12-25")
   * NEVER return null for date unless absolutely no date-like text exists

2. PRICE EXTRACTION (CRITICAL - OCR ACCURACY):
   ⚠️ ONLY EXTRACT PRICES FROM THE ITEMIZED PRODUCTS SECTION ⚠️

   * Prices are ALWAYS on the RIGHT side of each product line
   * Format: Usually X.XX (e.g., 4.99, 12.50, 100.00)
   * Look for decimal point - prices without decimals are rare
   * Each product line has format: [BARCODE] PRODUCT NAME [QUANTITY INFO] PRICE
   * The rightmost number with a decimal is almost always the price

   HOW TO IDENTIFY PRODUCT PRICES VS SUMMARY TOTALS:
   * Product prices: Appear in the ITEMIZED section, one per line, aligned right
   * Summary totals: Appear at BOTTOM of receipt, words like "SUBTOTAL", "TAX", "TOTAL"
   * If you see a line with "TOTAL" or "SUBTOTAL" → this is NOT a product, it's a summary
   * If you see "TAX", "SERVICE FEE", "TIP" → these ARE special items, add them to items array

   DO NOT CONFUSE:
   * ❌ Product codes, SKU numbers, or barcodes (left side) with prices (right side)
   * ❌ SUBTOTAL/TOTAL numbers (bottom summary) with individual item prices
   * ❌ The word "TOTAL" appearing before a price (e.g., "TOTAL 45.99") - this is the final total, NOT a product

   * Read each line INDEPENDENTLY - don't let previous lines influence current line
   * OCR DIGIT VERIFICATION (VERY IMPORTANT):
     - Carefully distinguish between similar-looking digits:
       * 3 vs 5 vs 8: Look at curves and openings carefully
       * 6 vs 8: 6 has opening at top, 8 is closed
       * 0 vs 8: 0 is more oval, 8 has two loops
       * 1 vs 7: 7 has horizontal top bar
     - If a price is blurry, smudged, or unclear: return null instead of guessing
     - If a price seems unusual (e.g., too high/low), RECHECK the digits but DON'T adjust it
     - Extract the ACTUAL digits you see, not what would make the math work

   EXAMPLES:
   * "012345 MILK 1 GAL @ 3.99" → totalPrice: 3.99 (product item)
   * "BREAD    2.49" → totalPrice: 2.49 (product item)
   * "CHEESE   [smudged]" → totalPrice: null (unreadable)
   * "SUBTOTAL  15.47" → DO NOT add to items (it's a summary, not a product)
   * "TAX       1.24" → ADD to items as {"description": "Tax", "totalPrice": 1.24, "category": "Other"}
   * "TOTAL     16.71" → Use for "totalAmount", DO NOT add to items
   * If you see "2 @ $3.00", that means quantity=2, unitPrice=3.00, totalPrice=6.00

3. PRODUCT-PRICE MATCHING (CRITICAL):
   ⚠️ ENSURE PRODUCT NAMES ARE ACCURATE AND COMPLETE ⚠️

   * Each product line has ONE price associated with it
   * Read the receipt LEFT to RIGHT: [optional barcode] [product name] [optional qty] [PRICE on far right]
   * The product name is usually between the barcode (if any) and the price

   PRODUCT NAME EXTRACTION:
   * Extract the FULL product name as written on the receipt
   * Common patterns:
     - "COCA COLA 2L" → description: "Coca Cola 2L"
     - "ORGANIC MILK" → description: "Organic Milk"
     - "012345 BREAD WHOLE WHEAT" → description: "Bread Whole Wheat" (barcode: "012345")
   * Preserve brand names, sizes, and descriptors (e.g., "ORGANIC", "2L", "LARGE")
   * DO NOT abbreviate or shorten product names
   * DO NOT include the price in the product name

   DO NOT MIX UP:
   * ❌ Prices between different products (each line is independent)
   * ❌ Product names with summary labels ("SUBTOTAL" is not a product)
   * ❌ Barcodes with product names (barcode goes in "barcode" field)

   * Process each line from top to bottom independently - treat each line as a separate extraction task
   * After extracting all items, you may verify the sum approximately matches the total
   * If totals don't match: DO NOT modify any prices - the user will fix errors in the review screen

   EXAMPLE LINE-BY-LINE PROCESSING:
   Line 1: "123456 MILK ORGANIC 1GAL    5.99"
     → barcode: "123456", description: "Milk Organic 1Gal", totalPrice: 5.99

   Line 2: "BREAD SOURDOUGH             3.49"
     → barcode: null, description: "Bread Sourdough", totalPrice: 3.49

   Line 3: "789012 EGGS LARGE DZ        4.29"
     → barcode: "789012", description: "Eggs Large Dz", totalPrice: 4.29

4. BARCODE EXTRACTION:
   * Barcodes are typically 12-13 digit numbers at the START of each line
   * Common on grocery/retail receipts (Walmart, Target, Kroger, etc.)
   * Format: UPC-A (12 digits), EAN-13 (13 digits)
   * Pattern: "012345678901 PRODUCT NAME 4.99"
   * Extract ONLY numeric digits, no letters or special characters
   * If barcode appears after product name (rare), still extract it

5. QUANTITY AND UNIT PRICE:
   * Look for patterns: "2 @ $5.00", "QTY 3", "3x", "EA $2.99"
   * quantity: Extract the number of items (1, 2, 3, etc.)
   * unitPrice: Price per single unit
   * totalPrice: unitPrice × quantity OR the final price shown on right
   * If only totalPrice is shown (no qty info), set quantity=1, unitPrice=totalPrice

6. TAX, FEES, AND CHARGES (IMPORTANT):
   ⚠️ ADD TAX/FEES TO ITEMS ARRAY, BUT NOT SUBTOTAL OR TOTAL ⚠️

   * ALWAYS include tax and fees as separate items in the items array
   * DO NOT include SUBTOTAL or TOTAL as items (they are summaries, not charges)

   WHAT TO INCLUDE IN ITEMS:
   ✅ "TAX", "SALES TAX", "GST", "VAT", "HST" → Add as item with description "Tax"
   ✅ "SERVICE FEE", "SERVICE CHARGE", "FEE" → Add as item with description "Service Fee"
   ✅ "DELIVERY FEE", "DELIVERY CHARGE" → Add as item with description "Delivery Fee"
   ✅ "TIP", "GRATUITY" → Add as item with description "Tip"

   WHAT NOT TO INCLUDE:
   ❌ "SUBTOTAL" → This is a sum of products, NOT an item
   ❌ "TOTAL", "GRAND TOTAL", "AMOUNT DUE" → Use for totalAmount field, NOT as an item

   * Tax/fees should be added to items array like this:
     {
       "description": "Tax",
       "quantity": 1,
       "unitPrice": [tax amount],
       "totalPrice": [tax amount],
       "category": "Other",
       "barcode": null
     }
   * The totalAmount should be the FINAL total (including tax/fees)
   * Verification: (Sum of product prices) + Tax + Fees ≈ Total Amount
   * Remember: SUBTOTAL is NOT an item, it's just a calculation checkpoint

7. ITEM CATEGORIES:
   * Food: Food, drinks, groceries, snacks, meals, coffee, produce
   * Transport: Gas, fuel, parking, tolls, transit, uber, lyft
   * Shopping: Clothing, electronics, household items, toys, books, hardware
   * Bills: Utilities, phone bill, internet, streaming services
   * Other: Tax, fees, tips, and anything else that doesn't clearly fit above

8. VALIDATION:
   * Verify that you extracted what you ACTUALLY saw, not what you think should be there
   * Check: sum of ALL item prices (products + tax + fees) should approximately equal totalAmount
   * If the math doesn't add up perfectly, that's OK - do NOT adjust prices to fix it
   * Ensure each item has a description (totalPrice can be null if unreadable)
   * Date must be in YYYY-MM-DD format (or null if truly unreadable)
   * Readable prices must have decimal points (e.g., 5.00 not 5)
   * Remember: The user will review and can correct any errors - prioritize honesty over perfection

FINAL CHECKLIST BEFORE RETURNING JSON:
✅ Items array contains ONLY products + tax/fees (NO subtotal, NO total line)
✅ Each product has the correct price from the RIGHT side of its line
✅ Product names are complete and accurate (not mixed with other lines)
✅ totalAmount = the final TOTAL at bottom of receipt
✅ Tax/fees are included as items if they appear on receipt
✅ No prices were adjusted to force totals to match

Return ONLY the JSON object with NO additional text.`;
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

    if (Array.isArray(expenseData.items) && expenseData.items.length > 0) {
      expenseData.items = inferBarcodesFromItems(expenseData.items);
    }

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

function inferBarcodesFromItems(items = []) {
  return items.map(item => {
    if (!item || typeof item !== 'object' || item.barcode) {
      return item;
    }

    const description = typeof item.description === 'string' ? item.description : '';
    if (!description) {
      return item;
    }

    const barcodeMatch = description.match(/^\s*(?:#|Item\s*)?(\d{8,14})(?:[\s:-]+)?(.*)$/i);
    if (!barcodeMatch) {
      return item;
    }

    const barcode = barcodeMatch[1];
    const remainingDescription = barcodeMatch[2]?.trim() || item.description;

    return {
      ...item,
      barcode,
      description: remainingDescription
    };
  });
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
    const categoryDefinitions = Array.isArray(analysis?.categories)
      ? analysis.categories.filter(Boolean)
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
    const history = analysis?.history || {};
    const expenseHistory = Array.isArray(history?.expenseHistory) ? history.expenseHistory : [];
    const monthlyHistory = Array.isArray(history?.recentMonthlyTotals) && history.recentMonthlyTotals.length
      ? history.recentMonthlyTotals
      : (Array.isArray(history?.monthlyTotals) ? history.monthlyTotals.slice(-12) : []);
    const trailingAverage = Number(history?.trailingAverage ?? 0);
    const lifetimeCategoryTotals = history?.lifetimeCategoryTotals || {};
    const firstExpenseDate = history?.firstExpenseDate || null;
    const latestExpenseDate = history?.latestExpenseDate || null;
    const projections = analysis?.projections || {};
    const projectedTotal = Number(projections?.projectedTotal ?? 0);
    const projectedRemaining = Number(projections?.remainingVsBudget ?? 0);

    const merchantHistoryMap = expenseHistory.reduce((acc, exp) => {
      const merchantName = (exp.merchant || '').toLowerCase();
      if (!merchantName) {
        return acc;
      }
      if (!acc[merchantName]) {
        acc[merchantName] = {
          name: exp.merchant,
          count: 0,
          total: 0,
          lastDate: null
        };
      }
      acc[merchantName].count += 1;
      acc[merchantName].total += Number(exp.amount) || 0;
      if (!acc[merchantName].lastDate) {
        acc[merchantName].lastDate = exp.date || null;
      }
      return acc;
    }, {});

    const riskiestCategory = categorySummary.reduce((worst, current) => {
      if (!current) return worst;
      const remaining = Number(current.remaining ?? 0);
      if (!worst) {
        return current;
      }
      const worstRemaining = Number(worst.remaining ?? 0);
      if (remaining < worstRemaining) {
        return current;
      }
      return worst;
    }, null);

    const normalizeAlias = (value) => {
      if (typeof value !== 'string') {
        return '';
      }
      return value.trim();
    };

    const camelCaseToWords = (value) => {
      if (typeof value !== 'string') {
        return '';
      }
      return value.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
    };

    const buildCategoryAliases = (category) => {
      const aliases = new Set();
      const idAlias = normalizeAlias(category?.id);
      const nameAlias = normalizeAlias(category?.name);
      if (idAlias) {
        aliases.add(idAlias.toLowerCase());
        const splitId = camelCaseToWords(idAlias).toLowerCase();
        if (splitId !== idAlias.toLowerCase()) {
          aliases.add(splitId);
        }
      }
      if (nameAlias) {
        aliases.add(nameAlias.toLowerCase());
      }
      return Array.from(aliases)
        .filter(Boolean)
        .map(alias => ({ alias, category }));
    };

    const categoryAliases = categoryDefinitions.flatMap(buildCategoryAliases);
    const customCategories = categoryDefinitions.filter(category => category && category.isCustom);

    const categorySummaryById = categorySummary.reduce((map, entry) => {
      const rawId = entry?.categoryId || entry?.categoryName;
      if (!rawId) {
        return map;
      }
      map[rawId.toLowerCase()] = entry;
      return map;
    }, {});

    const escapeRegex = (value) => {
      if (typeof value !== 'string') {
        return '';
      }
      return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    };

    const findCategoryInQuestion = () => {
      for (const entry of categoryAliases) {
        if (!entry?.alias) {
          continue;
        }
        const pattern = new RegExp(`\\b${escapeRegex(entry.alias)}\\b`, 'i');
        if (pattern.test(question)) {
          return entry.category;
        }
      }
      return null;
    };

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

    const includesAny = (keywords = []) => keywords.some(keyword => keyword && question.includes(keyword));
    const wantsPrediction = includesAny(['predict', 'forecast', 'projection', 'future', 'estimate', 'on track', 'finish', 'end up', 'projected', 'expect']);
    const wantsHistory = includesAny(['history', 'trend', 'over time', 'past year', 'previous months', 'month over month', 'month-by-month', 'year-over-year']);
    const wantsLastMonthSummary = includesAny(['last month', 'previous month', 'prior month']);
    const merchantMatchKey = Object.keys(merchantHistoryMap).find(key => question.includes(key));
    const matchedMerchantStats = merchantMatchKey ? merchantHistoryMap[merchantMatchKey] : null;
    const wantsAdvice = includesAny(['advice', 'should i', 'plan', 'suggest']);
    const asksAboutCustomCategories = includesAny(['custom category', 'custom categories', 'custom-budget', 'custom budget']);
    const matchedCategory = findCategoryInQuestion();

    const resolveCategorySummary = (category) => {
      if (!category) {
        return null;
      }
      const idKey = typeof category.id === 'string' ? category.id.toLowerCase() : null;
      const nameKey = typeof category.name === 'string' ? category.name.toLowerCase() : null;
      return (idKey && categorySummaryById[idKey])
        || (nameKey && categorySummaryById[nameKey])
        || null;
    };

    if (matchedCategory) {
      const summaryEntry = resolveCategorySummary(matchedCategory);
      const categoryLabel = matchedCategory.name || matchedCategory.id || 'that category';
      if (summaryEntry && Number.isFinite(summaryEntry.spent)) {
        responseParts.push(
          `${categoryLabel} has ${formatCurrency(summaryEntry.spent)} across ${summaryEntry.count || 0} expenses in this range.`
        );
        if (Number.isFinite(summaryEntry.remaining) && Number.isFinite(summaryEntry.budget) && summaryEntry.budget > 0) {
          responseParts.push(
            summaryEntry.remaining >= 0
              ? `You still have ${formatCurrency(summaryEntry.remaining)} left from its ${formatCurrency(summaryEntry.budget)} budget.`
              : `It's ${formatCurrency(Math.abs(summaryEntry.remaining))} over its ${formatCurrency(summaryEntry.budget)} budget.`
          );
        }
      } else if (matchedCategory.isCustom) {
        responseParts.push(`Yes—${categoryLabel} is one of your custom categories, but there are no expenses in this period yet.`);
      } else {
        responseParts.push(`I don't see any recent activity in ${categoryLabel}.`);
      }
      if (matchedCategory.isCustom) {
        responseParts.push('That category was created by you, not one of the defaults.');
      }
    } else if (asksAboutCustomCategories) {
      if (customCategories.length === 0) {
        responseParts.push('I only see the default categories right now. Add custom ones from the Categories view.');
      } else {
        const names = customCategories.map(category => category.name || category.id).filter(Boolean);
        responseParts.push(`You currently have ${customCategories.length} custom categories: ${names.join(', ')}.`);
      }
    } else if (wantsPrediction) {
      if (Number.isFinite(projectedTotal) && projectedTotal > 0) {
        const daysElapsed = Number(projections?.daysElapsed ?? 0);
        const totalDays = Number(projections?.totalDays ?? 0);
        responseParts.push(
          `Based on ${daysElapsed}/${totalDays} days logged, you're on pace to finish around ${formatCurrency(projectedTotal)} this period.`
        );
      } else if (trailingAverage > 0) {
        responseParts.push(
          `I don't have a live projection, but your trailing monthly average is ${formatCurrency(trailingAverage)}.`
        );
      } else {
        responseParts.push("I need a bit more recent history before I can project this period with confidence.");
      }

      if (Number.isFinite(projectedRemaining)) {
        responseParts.push(
          projectedRemaining >= 0
            ? `That path keeps you roughly ${formatCurrency(projectedRemaining)} under budget.`
            : `That trajectory would run about ${formatCurrency(Math.abs(projectedRemaining))} over budget.`
        );
      }

      if (monthlyHistory.length > 1) {
        const lastMonth = monthlyHistory[monthlyHistory.length - 1];
        const prevMonth = monthlyHistory[monthlyHistory.length - 2];
        const delta = lastMonth && prevMonth ? lastMonth.total - prevMonth.total : 0;
        if (lastMonth && prevMonth) {
          responseParts.push(
            `Last month (${lastMonth.month}) landed at ${formatCurrency(lastMonth.total)}, ${delta >= 0 ? 'up' : 'down'} ${formatCurrency(Math.abs(delta))} vs the month before.`
          );
        }
      }

      if (riskiestCategory) {
        const remaining = Number(riskiestCategory.remaining ?? 0);
        const direction = remaining < 0 ? 'already over' : 'most active';
        responseParts.push(
          `Focus on ${riskiestCategory.categoryName}—it's ${direction} with ${formatCurrency(Math.abs(remaining))} ${remaining < 0 ? 'beyond' : 'left in'} its budget.`
        );
      } else if (topCategory) {
        responseParts.push(
          `${topCategory.categoryName} dominates the forecast, so trimming even a couple of trips there moves the projection fast.`
        );
      }

      if (wantsAdvice && recentExpenses.length) {
        const lastExpense = recentExpenses[0];
        responseParts.push(
          `Start by reviewing the ${formatCurrency(lastExpense.amount)} from ${lastExpense.merchant}—that pattern shows up often this month.`
        );
      }
    } else if (wantsHistory || wantsLastMonthSummary) {
      if (monthlyHistory.length > 0) {
        const describedMonths = monthlyHistory.length;
        const lastMonth = monthlyHistory[monthlyHistory.length - 1];
        const prevMonth = monthlyHistory.length > 1 ? monthlyHistory[monthlyHistory.length - 2] : null;
        responseParts.push(
          `You've tracked ${describedMonths} months so far. Last month (${lastMonth.month}) totaled ${formatCurrency(lastMonth.total)}.`
        );
        if (prevMonth) {
          const delta = lastMonth.total - prevMonth.total;
          responseParts.push(
            `That's ${delta >= 0 ? 'up' : 'down'} ${formatCurrency(Math.abs(delta))} compared to ${prevMonth.month}.`
          );
        }
      } else if (expenseHistory.length > 0) {
        responseParts.push(
          `I can see ${expenseHistory.length} logged expenses stretching back to ${firstExpenseDate || 'your earliest entry'}.`
        );
      } else {
        responseParts.push("I don't have enough historical data to summarize yet.");
      }

      if (trailingAverage > 0) {
        responseParts.push(`Your rolling monthly average sits near ${formatCurrency(trailingAverage)}.`);
      }

      const lifetimeTopCategory = Object.entries(lifetimeCategoryTotals).reduce((best, [name, total]) => {
        if (!best || total > best.total) {
          return { name, total };
        }
        return best;
      }, null);

      if (lifetimeTopCategory) {
        responseParts.push(
          `${lifetimeTopCategory.name} has absorbed ${formatCurrency(lifetimeTopCategory.total)} all-time, more than any other category.`
        );
      }

      if (firstExpenseDate && latestExpenseDate) {
        responseParts.push(`History spans ${firstExpenseDate} through ${latestExpenseDate}.`);
      }
    } else if (matchedMerchantStats) {
      responseParts.push(
        `You've shopped at ${matchedMerchantStats.name} ${matchedMerchantStats.count} times for ${formatCurrency(matchedMerchantStats.total)}.`
      );
      if (matchedMerchantStats.lastDate) {
        responseParts.push(`Last visit: ${matchedMerchantStats.lastDate}.`);
      }
    } else if (question.includes('total') || question.includes('grand total')) {
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
    } else if (question.includes('recent') || (question.includes('last') && !wantsLastMonthSummary)) {
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
      if (monthlyHistory.length > 0) {
        const lastMonth = monthlyHistory[monthlyHistory.length - 1];
        responseParts.push(`Last month's run rate was ${formatCurrency(lastMonth.total)}.`);
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
