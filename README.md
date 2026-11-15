# RentNest Bengaluru

RentNest is a rental marketplace focused on Bengaluru neighborhoods. Rent and deposits are shown in INR, listings are restricted to Bengaluru/Bangalore, and property details include an embedded Google Map plus a directions link.

## Run locally

1. Start a local MongoDB instance, or provide a MongoDB connection string.
2. Copy `server/.env.example` to `server/.env`; configure MongoDB, a private random `JWT_SECRET` (at least 32 characters), and SMTP email delivery.
3. In `server`, run `npm install` and then `npm run dev`.
4. In `client`, run `npm install` and then `npm run dev`.
5. Open the Vite URL shown in the client terminal.

### Email verification

- **Email:** configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `EMAIL_FROM` with your real mailbox and a sender address verified by your SMTP provider. For Gmail, use your real Gmail address and an app password rather than your regular account password. Create an [Abstract Email Validation API](https://www.abstractapi.com/api/email-validation) key and set `ABSTRACT_API_KEY`.
- Never put provider credentials in client files or commit `.env`. Use your deployment platform's secret manager in production.

Registration checks the address with Abstract before creating the account or generating a 6-digit code. Undeliverable, disposable, and catch-all addresses are rejected; reserved placeholder domains such as `example.com` and `.test` are rejected locally. A deliverability check cannot prove who owns an inbox, so the code is still sent and must be entered to prove access. Codes are hashed and stored in MongoDB for 5 minutes; successful verification is required before sign-in or protected features. If the Abstract API is unavailable or unconfigured, registration fails closed without sending a code.

## Live marketplace

Socket.IO broadcasts new and updated listings to connected browsers and delivers new inquiries to the verified listing owner's private socket room. Listings, user accounts, email verification state, and renter inquiries are persisted in MongoDB. Google Maps directions use each listing's address and neighborhood; owners can optionally provide a Google Maps directions URL.

Verified owners can publish property listings; renter accounts and anonymous visitors can search available homes by neighborhood, keywords, monthly budget, and home category. `GET /api/listings` also accepts `type`, `bedrooms`, `city`, `maxRent`, `category`, and `q` filters.

Uploads are stored locally under `server/uploads` for development. Use managed object storage, HTTPS, and production SMTP credentials for deployment. The client includes sample Bengaluru homes when the API is offline; verification and persistence require the configured API, MongoDB, and SMTP services.
