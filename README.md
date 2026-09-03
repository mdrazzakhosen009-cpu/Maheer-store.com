# MAHEER STORE

Premium skincare e-commerce website + Admin Panel.

## Render
Build: `npm install`
Start: `npm start`

## Required environment variables
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `ADMIN_PASSWORD`
- `GEMINI_API_KEY`
- `GEMINI_MODEL` (recommended: `gemini-3.1-flash-lite`)

## Important
- Dynamic products, orders, agents, About Store and website/payment/chatbot settings are stored in Turso.
- There is **no 20-orders-per-day limit** and no application-level daily order cap.
- AI chatbot has **no hard 500-message/day application limit**. Google Gemini API project/model rate limits still apply.
- Chatbot uses smart context: it selects relevant products and only keeps the last few conversation turns instead of sending the whole catalog every time.
- Product images uploaded from Admin are resized and converted to WebP in the browser before upload, then stored as Base64 data URLs in Turso.
- The supplied model/skincare image is used in the storefront hero.
