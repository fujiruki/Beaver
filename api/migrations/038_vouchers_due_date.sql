-- R-0191: 納期を納品日とは別に保持する
ALTER TABLE vouchers ADD COLUMN due_date DATE;
