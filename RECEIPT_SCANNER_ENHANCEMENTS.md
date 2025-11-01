# Receipt Scanner Enhancements

## Overview
The receipt scanner has been enhanced with two major improvements:

1. **Improved Price Extraction Accuracy**
2. **Automatic Product Name Lookup using Barcodes**

## 1. Enhanced Price Extraction

### What Changed
The AI extraction instructions now include specific guidelines to improve price accuracy:

- Double-checks that item prices match exactly what's printed on the receipt
- Verifies that the sum of all item prices matches the final total
- Distinguishes between product codes/SKU numbers and actual prices
- Handles multi-line items correctly
- Properly calculates prices when quantity × unit price is shown

### How It Works
The AI model now receives explicit instructions to:
- Capture the FINAL price on the right side of receipts
- Avoid confusing product codes with prices
- Not miss decimal points
- Verify totals match the sum of items

## 2. Barcode Product Name Lookup

### What It Does
When barcodes are detected on receipts (common on Walmart, Target, and grocery store receipts), the system automatically looks up the full product name to replace shortened names.

### How It Works

1. **Barcode Detection**: The AI extracts barcodes (UPC/EAN codes) from the receipt image
   - Looks for 12-13 digit numbers near product names
   - Commonly found BEFORE product names on receipts
   - Example: `012345678901 PROD NAME` → barcode is `012345678901`

2. **Product Lookup**: Uses multiple barcode databases to find full product names
   - **OpenFoodFacts** (free, no API key required) - Best for food items
   - **UPCItemDB** (optional, requires API key) - General products
   - **BarcodeLookup** (optional, requires API key) - Comprehensive database

3. **Name Enhancement**: Replaces shortened names with full product names
   - Example: `GV MLK 2%` → `Great Value 2% Reduced Fat Milk`
   - Keeps the original name for reference

### Configuration

#### Environment Variables

Add these to your `.env` file:

```bash
# Enable/disable barcode lookup (enabled by default)
ENABLE_BARCODE_LOOKUP=true

# Optional: UPCItemDB API Key (free tier available)
# Get it from: https://www.upcitemdb.com/
UPCITEMDB_API_KEY=your_key_here

# Optional: BarcodeLookup API Key (paid service)
# Get it from: https://www.barcodelookup.com/
BARCODELOOKUP_API_KEY=your_key_here
```

#### Free Tier Option
The system works out-of-the-box with **OpenFoodFacts** (no API key required). This is perfect for grocery items and food products. The optional API keys provide:
- **UPCItemDB**: 100 free requests/day, good for general products
- **BarcodeLookup**: Paid service with comprehensive database

### Example Usage

**Before Enhancement:**
```json
{
  "description": "GV MLK 2%",
  "totalPrice": 3.98,
  "barcode": "078742074986"
}
```

**After Enhancement:**
```json
{
  "description": "Great Value 2% Reduced Fat Milk",
  "originalDescription": "GV MLK 2%",
  "totalPrice": 3.98,
  "barcode": "078742074986",
  "brand": "Great Value",
  "barcodeSource": "OpenFoodFacts"
}
```

### Supported Receipt Formats

The enhancements work best with:
- **Walmart** receipts (often show barcodes before product names)
- **Target** receipts
- **Grocery store** receipts (Kroger, Safeway, etc.)
- **Retail stores** with barcode scanning

### Logging

The system logs barcode lookups for debugging:

```
[Barcode] Enhancing 5 items with barcode lookups...
[Barcode] Looking up product for barcode: 078742074986
[Barcode] Found on OpenFoodFacts: Great Value 2% Reduced Fat Milk
[Barcode] Enhanced: "GV MLK 2%" -> "Great Value 2% Reduced Fat Milk"
[Barcode] Successfully enhanced 3 out of 5 items
```

### Error Handling

- If barcode lookup fails, the original product name is kept
- The receipt processing continues even if barcode enhancement fails
- Network timeouts are set to 5 seconds per lookup
- Multiple APIs are tried in sequence until one succeeds

### Testing

To test the enhancements:

1. Upload a receipt from Walmart or a grocery store
2. Check the server logs for barcode enhancement messages
3. View the expense details to see if product names were enhanced
4. Compare original and full product names in the database

### Disabling the Feature

If you want to disable barcode lookup:

```bash
# Add to .env
ENABLE_BARCODE_LOOKUP=false
```

### Performance Considerations

- Barcode lookups run in parallel for all items
- Each lookup has a 5-second timeout
- Lookups are cached per request
- The feature adds ~1-3 seconds per receipt on average
- Failed lookups don't slow down the process

### Future Enhancements

Potential improvements:
- Local barcode database cache
- User-specific barcode learning
- Optical barcode reading from receipt images
- Support for store-specific product codes

## Troubleshooting

### Prices Still Incorrect
- Check if the AI model is correctly configured (`OPENAI_API_KEY` or `DEEPSEEK_API_KEY`)
- Enable debug logging: `AI_DEBUG_LOG=true` in `.env`
- Review the raw AI response in server logs

### Barcodes Not Detected
- Some receipts don't include barcodes (restaurants, services)
- Ensure the receipt image is clear and not blurry
- Check if your AI model supports high-resolution image analysis

### Product Names Not Enhanced
- Verify `ENABLE_BARCODE_LOOKUP=true` in `.env`
- Check server logs for barcode lookup attempts
- Consider adding API keys for better coverage
- OpenFoodFacts is best for food; other products may need UPCItemDB

### Network Errors
- Barcode APIs may be temporarily unavailable
- Check your internet connection
- The system will continue without enhancement on error

## Credits

- **OpenFoodFacts**: Free, open-source food product database
- **UPCItemDB**: Barcode lookup API with free tier
- **BarcodeLookup**: Commercial barcode database API
