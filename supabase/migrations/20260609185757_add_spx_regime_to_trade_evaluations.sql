ALTER TABLE trade_evaluations
  ADD COLUMN spx_price   double precision,
  ADD COLUMN spx_sma50   double precision,
  ADD COLUMN spx_sma200  double precision,
  ADD COLUMN spx_regime  text;
