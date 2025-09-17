const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

let openai = null;

function initOpenAI() {
  if (!process.env.OPENAI_API_KEY) {
    console.warn('⚠️  OPENAI_API_KEY not found. AI features will be disabled.');
    return null;
  }

  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  return openai;
}

async function processReceiptWithAI(imagePath) {
  try {
    const openaiClient = initOpenAI();

    if (!openaiClient) {
      throw new Error('OpenAI API key not configured. Please add OPENAI_API_KEY to your .env file.');
    }

    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');
    const fileExtension = path.extname(imagePath).toLowerCase();

    let mimeType;
    if (fileExtension === '.png') {
      mimeType = 'image/png';
    } else if (fileExtension === '.jpg' || fileExtension === '.jpeg') {
      mimeType = 'image/jpeg';
    } else if (fileExtension === '.pdf') {
      mimeType = 'application/pdf';
    } else {
      throw new Error('Unsupported file format');
    }

    const response = await openaiClient.chat.completions.create({
      model: "gpt-4-vision-preview",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Please analyze this receipt image and extract the following information in JSON format:
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

              If any information is not clearly visible or available, use null for that field. Ensure all monetary amounts are numbers, not strings.`
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 1000
    });

    const extractedText = response.choices[0].message.content;

    try {
      const jsonMatch = extractedText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const expenseData = JSON.parse(jsonMatch[0]);

        validateExpenseData(expenseData);

        return expenseData;
      } else {
        throw new Error('No JSON found in AI response');
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      console.log('Raw AI response:', extractedText);
      throw new Error('Failed to parse expense data from receipt');
    }

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