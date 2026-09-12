UPDATE `inventory_product_metadata`
SET
  `review_status` = CASE
    WHEN lower(trim(`review_status`)) = 'final' THEN 'final'
    ELSE 'draft'
  END,
  `finalized_at` = CASE
    WHEN lower(trim(`review_status`)) = 'final' THEN `finalized_at`
    ELSE NULL
  END;
