declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    FILES: R2Bucket;
    INVENTORY_SUPABASE_SERVICE_ROLE_KEY?: string;
    MARKET_SEARCH_ENDPOINT?: string;
    MARKET_SEARCH_BEARER_TOKEN?: string;
  }
}
