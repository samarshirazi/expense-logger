-- Create table for AI category learning rules
CREATE TABLE IF NOT EXISTS category_learning (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    merchant_name VARCHAR(255),
    description_pattern VARCHAR(255),
    learned_category VARCHAR(50) NOT NULL,
    confidence_score INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, merchant_name, description_pattern)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_category_learning_user_merchant ON category_learning(user_id, merchant_name);
CREATE INDEX IF NOT EXISTS idx_category_learning_user_desc ON category_learning(user_id, description_pattern);

-- Function to update confidence score when pattern is reused
CREATE OR REPLACE FUNCTION increment_category_confidence(
    p_user_id INTEGER,
    p_merchant VARCHAR(255),
    p_description VARCHAR(255),
    p_category VARCHAR(50)
) RETURNS VOID AS $$
BEGIN
    INSERT INTO category_learning (user_id, merchant_name, description_pattern, learned_category, confidence_score)
    VALUES (p_user_id, p_merchant, p_description, p_category, 1)
    ON CONFLICT (user_id, merchant_name, description_pattern) 
    DO UPDATE SET 
        confidence_score = category_learning.confidence_score + 1,
        learned_category = p_category,
        updated_at = CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;
