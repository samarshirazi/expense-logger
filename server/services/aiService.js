const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const https = require('https');

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

function determineMimeType(imagePath) {
  const fileExtension = path.extname(imagePath).toLowerCase();

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

function loadImageAsBase64(imagePath) {
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');
  const mimeType = determineMimeType(imagePath);

  return { base64Image, mimeType };
}

function buildExtractionInstruction() {
  return `Please analyze this receipt image and extract the following information in JSON format:
{
  "merchantName": "Name of the store/restaurant",
  "date": "Date in YYYY-MM-DD format",
  "totalAmount": "Total amount as a number",
  "currency": "Currency code (e.g., USD, EUR)",
  "category": "Expense category (e.g., Food, Transportation, Office Supplies, etc.)",
  "items": [
    {
      "description": "Item description",
      "quantity": "Quantity as number",
      "unitPrice": "Unit price as number",
      "totalPrice": "Total price for this item as number"
    }
  ],
  "paymentMethod": "Cash, Credit Card, Debit Card, etc.",
  "taxAmount": "Tax amount as number if visible",
  "tipAmount": "Tip amount as number if visible"
}

If any information is not clearly visible or available, use null for that field. Ensure all monetary amounts are numbers, not strings.`;
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

  const messages = [
    {
      role: 'system',
      content: 'You are a meticulous assistant that extracts structured expense data from receipts.',
    },
    {
      role: 'user',
      content: `${buildExtractionInstruction()}

The receipt file is provided below. Decode the base64 payload before analyzing it.

MIME type: ${mimeType}
Base64 data:
${base64Image}`,
    },
  ];

  const payload = JSON.stringify({
    model,
    messages,
    temperature: 0,
    max_tokens: 1000,
  });

  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        hostname: 'api.deepseek.com',
        path: '/v1/chat/completions',
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

async function processReceiptWithAI(imagePath) {
  try {
    const provider = resolveProvider();

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

    const { base64Image, mimeType } = loadImageAsBase64(imagePath);

    const extractedText = provider === AI_PROVIDERS.DEEPSEEK
      ? await callDeepSeek(base64Image, mimeType)
      : await callOpenAI(base64Image, mimeType);

    const expenseData = extractExpenseData(extractedText);

    validateExpenseData(expenseData);

    return expenseData;

  } catch (error) {
    console.error('AI processing error:', error);
    throw new Error(`AI processing failed: ${error.message}`);
  }
}

function validateExpenseData(data) {
  const requiredFields = ['merchantName', 'totalAmount'];

  for (const field of requiredFields) {
    if (data[field] === undefined || data[field] === null || data[field] === '') {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  if (typeof data.totalAmount !== 'number' || data.totalAmount <= 0) {
    throw new Error('Total amount must be a positive number');
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
