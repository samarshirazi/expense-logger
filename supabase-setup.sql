-- Expense Receipt Logger - Supabase Database Setup
-- Run this SQL in your Supabase SQL Editor

-- Create the expenses table
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_name TEXT NOT NULL,
  date DATE,
  total_amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  category TEXT,
  items JSONB DEFAULT '[]'::jsonb,
  payment_method TEXT,
  tax_amount DECIMAL(10,2),
  tip_amount DECIMAL(10,2),
  original_filename TEXT,
  drive_file_id TEXT,
  upload_date TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_expenses_merchant ON expenses(merchant_name);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
CREATE INDEX IF NOT EXISTS idx_expenses_created_at ON expenses(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_total_amount ON expenses(total_amount);

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_expenses_updated_at ON expenses;
CREATE TRIGGER update_expenses_updated_at
    BEFORE UPDATE ON expenses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows all operations for now
-- You can customize this based on your authentication needs
CREATE POLICY "Allow all operations on expenses" ON expenses
FOR ALL USING (true) WITH CHECK (true);

-- Optional: Create a view for expense summaries
CREATE OR REPLACE VIEW expense_summaries AS
SELECT
  DATE_TRUNC('month', date) as month,
  category,
  currency,
  COUNT(*) as transaction_count,
  SUM(total_amount) as total_amount,
  AVG(total_amount) as avg_amount,
  MIN(total_amount) as min_amount,
  MAX(total_amount) as max_amount
FROM expenses
WHERE date IS NOT NULL
GROUP BY DATE_TRUNC('month', date), category, currency
ORDER BY month DESC, category;

-- Optional: Create a function to get expenses by date range
CREATE OR REPLACE FUNCTION get_expenses_by_date_range(
  start_date DATE,
  end_date DATE
)
RETURNS TABLE (
  id UUID,
  merchant_name TEXT,
  date DATE,
  total_amount DECIMAL(10,2),
  currency VARCHAR(3),
  category TEXT,
  created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE SQL
AS $$
  SELECT
    e.id,
    e.merchant_name,
    e.date,
    e.total_amount,
    e.currency,
    e.category,
    e.created_at
  FROM expenses e
  WHERE e.date >= start_date AND e.date <= end_date
  ORDER BY e.date DESC, e.created_at DESC;
$$;

-- Insert some sample data (optional - remove in production)
-- INSERT INTO expenses (
--   merchant_name, date, total_amount, currency, category,
--   payment_method, upload_date
-- ) VALUES
-- ('Starbucks', '2024-01-15', 12.50, 'USD', 'Food', 'Credit Card', NOW()),
-- ('Uber', '2024-01-14', 25.30, 'USD', 'Transportation', 'Credit Card', NOW()),
-- ('Office Depot', '2024-01-13', 45.99, 'USD', 'Office Supplies', 'Debit Card', NOW());

-- Grant necessary permissions (adjust based on your needs)
-- GRANT ALL ON expenses TO authenticated;
-- GRANT ALL ON expense_summaries TO authenticated;

-- Create RLS policies for authenticated users (optional)
-- DROP POLICY IF EXISTS "Users can view all expenses" ON expenses;
-- CREATE POLICY "Users can view all expenses" ON expenses
-- FOR SELECT USING (auth.role() = 'authenticated');

-- DROP POLICY IF EXISTS "Users can insert expenses" ON expenses;
-- CREATE POLICY "Users can insert expenses" ON expenses
-- FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- DROP POLICY IF EXISTS "Users can update their expenses" ON expenses;
-- CREATE POLICY "Users can update their expenses" ON expenses
-- FOR UPDATE USING (auth.role() = 'authenticated');

-- DROP POLICY IF EXISTS "Users can delete their expenses" ON expenses;
-- CREATE POLICY "Users can delete their expenses" ON expenses
-- FOR DELETE USING (auth.role() = 'authenticated');

COMMENT ON TABLE expenses IS 'Stores expense data extracted from receipts using AI';
COMMENT ON COLUMN expenses.items IS 'JSON array of individual items from the receipt';
COMMENT ON COLUMN expenses.drive_file_id IS 'Google Drive file ID for the receipt image';
COMMENT ON COLUMN expenses.upload_date IS 'When the receipt was uploaded and processed';

-- Success message
SELECT 'Expense Receipt Logger database setup completed successfully!' as status;