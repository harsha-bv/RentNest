# RentNest Bengaluru

RentNest is a rental marketplace focused on Bengaluru neighborhoods. Rent and deposits are shown in INR, listings are restricted to Bengaluru/Bangalore, and property details include an embedded Google Map plus a directions link.

## Run locally

1. Start a local MongoDB instance, or provide a MongoDB connection string.
2. Copy `server/.env.example` to `server/.env`; configure MongoDB, a private random `JWT_SECRET` (at least 32 characters), SMTP email delivery, and a Twilio Verify service.
3. In `server`, run `npm install` and then `npm run dev`.
4. In `client`, run `npm install` and then `npm run dev`.
5. Open the Vite URL shown in the client terminal.

### Real verification providers

- **Email:** configure an SMTP account with `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and a verified `EMAIL_FROM` sender. For Gmail, use an app password rather than your regular account password.
- **Phone:** configure Twilio Verify using `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_VERIFY_SERVICE_SID`. The app currently verifies Indian mobile numbers (`+91`).
- Never put provider credentials in client files or commit `.env`. Use your deployment platform's secret manager in production.

Registration immediately requests a 6-digit email code and a Twilio SMS code. Email codes are hashed and stored in MongoDB with a 10-minute expiry; Twilio verifies SMS codes. The user and both verification states are stored in MongoDB. Accounts cannot sign in or use protected features until both channels are verified. Unverified registrations can resend their codes; legacy accounts without a phone can add one after email verification.

## Live marketplace

Socket.IO broadcasts new and updated listings to connected browsers and delivers new inquiries to the verified listing owner's private socket room. Listings, user accounts, email verification state, and renter inquiries are persisted in MongoDB. Google Maps directions use each listing's address and neighborhood; owners can optionally provide a Google Maps directions URL.

Uploads are stored locally under `server/uploads` for development. Use managed object storage, HTTPS, and production SMTP/Twilio credentials for deployment. The client includes sample Bengaluru homes when the API is offline; verification and persistence require the configured API, MongoDB, SMTP, and Twilio services.
