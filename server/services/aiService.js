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
  "category": string (default "Other"),
  "items": [ {"description": string, "quantity": number|null, "unitPrice": number|null, "totalPrice": number|null} ],
  "paymentMethod": string|null,
  "taxAmount": number|null,
  "tipAmount": number|null
}
Rules:
- Use null when a value is missing or unreadable.
- All monetary fields must be numbers (not strings).
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

      return {
        merchantName: 'Sample Coffee Shop',
        date: new Date().toISOString().slice(0, 10),
        totalAmount: 11.5,
        currency: 'USD',
        category: 'Food',
        items: [
          {
            description: 'Latte',
            quantity: 1,
            unitPrice: 4.5,
            totalPrice: 4.5,
          },
          {
            description: 'Blueberry Muffin',
            quantity: 1,
            unitPrice: 3.5,
            totalPrice: 3.5,
          },
          {
            description: 'Sparkling Water',
            quantity: 1,
            unitPrice: 2.0,
            totalPrice: 2.0,
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

  if (!data.category) {
    data.category = 'Other';
  }
}

function isValidDate(dateString) {
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date);
}

module.exports = {
  processReceiptWithAI
};
