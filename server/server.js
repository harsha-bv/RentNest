import crypto from "node:crypto";
import { createServer } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import dns from "node:dns";
import multer from "multer";
import { sendVerificationEmail } from "./utils/sendEmail.js";
import { isAllowedEmailAddress } from "./utils/emailAddress.js";
import { validateEmailDeliverability } from "./utils/validateEmailDeliverability.js";
import { Server as SocketServer } from "socket.io";

dotenv.config();

dns.setServers(["8.8.8.8", "1.1.1.1"]);

const app = express();
const httpServer = createServer(app);
const PORT = Number(process.env.PORT) || 5000;
const JWT_SECRET = process.env.JWT_SECRET;
const clientOrigins = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(",").map((origin) => origin.trim())
  : ["http://localhost:5173", "http://127.0.0.1:5173"];
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDirectory = path.join(__dirname, "uploads");
const io = new SocketServer(httpServer, { cors: { origin: clientOrigins } });

fs.mkdirSync(uploadDirectory, { recursive: true });

app.disable("x-powered-by");
app.use(cors({ origin: clientOrigins }));
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  return next();
});
app.use(express.json({ limit: "1mb" }));
app.use("/uploads", express.static(uploadDirectory, { maxAge: "1d", index: false }));

function isBengaluruCity(value) {
  return typeof value === "string" && /\b(bengaluru|bangalore)\b/i.test(value);
}

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
  phone: {
    type: String,
    trim: true,
    match: /^\+91[6-9]\d{9}$/,
    index: { unique: true, partialFilterExpression: { phone: { $type: "string" } } },
  },
  emailVerified: { type: Boolean, default: false },
  tokenVersion: { type: Number, default: 0 },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ["renter", "owner"], default: "renter" },
}, { timestamps: true });

const emailCodeSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  codeHash: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  lastSentAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true, expires: 0 },
});

const listingSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, minlength: 8, maxlength: 100 },
  description: { type: String, required: true, trim: true, minlength: 30, maxlength: 2000 },
  city: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
    validate: { validator: isBengaluruCity, message: "RentNest is currently focused on Bengaluru neighborhoods." },
  },
  address: { type: String, required: true, trim: true, maxlength: 180 },
  rent: { type: Number, required: true, min: 1, max: 1000000 },
  deposit: { type: Number, required: true, min: 0, max: 1000000 },
  bedrooms: { type: Number, required: true, min: 0, max: 50 },
  bathrooms: { type: Number, required: true, min: 1, max: 50 },
  propertyType: { type: String, enum: ["Apartment", "House", "Room", "Loft", "Townhouse", "Studio"], default: "Apartment" },
  availableFrom: { type: String, required: true, maxlength: 10 },
  amenities: { type: [String], default: [], validate: (items) => items.length <= 15 },
  media: {
    type: [{
      url: { type: String, required: true },
      type: { type: String, enum: ["image", "video"], required: true },
    }],
    default: [],
    validate: (items) => items.length <= 10,
  },
  mapUrl: { type: String, maxlength: 500 },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  ownerName: { type: String, required: true, maxlength: 80 },
  ownerEmail: { type: String, required: true, select: false },
  status: { type: String, enum: ["available", "rented"], default: "available", index: true },
}, { timestamps: true });

const inquirySchema = new mongoose.Schema({
  listing: { type: mongoose.Schema.Types.ObjectId, ref: "Listing", required: true, index: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  renter: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  message: { type: String, required: true, trim: true, minlength: 10, maxlength: 1500 },
  moveInDate: { type: String, maxlength: 10 },
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model("User", userSchema);
const Listing = mongoose.models.Listing || mongoose.model("Listing", listingSchema);
const Inquiry = mongoose.models.Inquiry || mongoose.model("Inquiry", inquirySchema);
const EmailCode = mongoose.models.EmailCode || mongoose.model("EmailCode", emailCodeSchema);

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;

  if (!token) return next();

  let claims;

  try {
    claims = jwt.verify(token, JWT_SECRET, { issuer: "rentnest" });
  } catch {
    return next();
  }

  return User.findById(claims.sub)
    .select("email emailVerified tokenVersion")
    .lean()
    .then((account) => {
      if (
        account?.emailVerified &&
        isAllowedEmailAddress(account.email) &&
        (claims.ver ?? 0) === (account.tokenVersion ?? 0)
      ) {
        socket.data.userId = account._id.toString();
        socket.data.expiresAt = claims.exp;
      }

      return next();
    })
    .catch(next);
});

io.on("connection", (socket) => {
  if (!socket.data.userId) return;
  socket.join(`user:${socket.data.userId}`);
  const remaining = socket.data.expiresAt * 1000 - Date.now();
  if (remaining > 0) {
    const expiryTimer = setTimeout(() => socket.disconnect(true), remaining);
    socket.on("disconnect", () => clearTimeout(expiryTimer));
  }
});

const allowedExtensions = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
};

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, uploadDirectory),
    filename: (_req, file, callback) => callback(null, `${crypto.randomUUID()}${allowedExtensions[file.mimetype]}`),
  }),
  limits: { fileSize: 25 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, callback) => {
    if (!allowedExtensions[file.mimetype]) {
      callback(new Error("Upload JPG, PNG, WebP, MP4, or MOV files only."));
      return;
    }
    callback(null, true);
  },
});

function publicUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    emailVerified: Boolean(user.emailVerified),
  };
}
function signToken(user) {
  return jwt.sign({
    sub: user._id.toString(),
    role: user.role,
    ver: user.tokenVersion ?? 0,
  }, JWT_SECRET, { expiresIn: "7d", issuer: "rentnest" });
}

function verificationError(message, status = 503) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function verificationHash(userId, code) {
  return crypto.createHmac("sha256", JWT_SECRET).update(`${userId}:${code}`).digest("hex");
}


async function sendEmailCode(user) {
  if (user.emailVerified) {
    throw verificationError("This email address is already verified.", 400);
  }

  const now = new Date();

  const currentCode = await EmailCode.findOne({ user: user._id });

  if (
    currentCode &&
    now.getTime() - currentCode.lastSentAt.getTime() < 60_000
  ) {
    throw verificationError(
      "Wait a minute before requesting another email code.",
      429
    );
  }

  const code = crypto.randomInt(100000, 1000000).toString();

  await EmailCode.findOneAndUpdate(
    { user: user._id },
    {
      codeHash: verificationHash(user._id, code),
      attempts: 0,
      lastSentAt: now,
      expiresAt: new Date(now.getTime() + 5 * 60_000),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await sendVerificationEmail(user.email, code);
}


function authPayload(user) {
  const verified = Boolean(user.emailVerified && isAllowedEmailAddress(user.email));

  return {
    ...(verified ? { token: signToken(user) } : {}),
    user: publicUser(user),
    verificationRequired: !verified,
  };
}

const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 12,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Too many verification attempts. Please wait and try again." },
});

const resendLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Too many code requests. Please try again later." },
});

async function requireAuth(req, res, next) {
  const authorization = req.get("authorization") || "";
  const [scheme, token] = authorization.split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ message: "Sign in to continue." });
  }
  let claims;
  try {
    claims = jwt.verify(token, JWT_SECRET, { issuer: "rentnest" });
  } catch {
    return res.status(401).json({ message: "Your session has expired. Please sign in again." });
  }
  const account = await User.findById(claims.sub)
  .select("email role emailVerified tokenVersion")
  .lean();
  if (!account) return res.status(401).json({ message: "This account is no longer available." });
  if ((claims.ver ?? 0) !== (account.tokenVersion ?? 0)) {
    return res.status(401).json({ message: "This session has been revoked. Please sign in again." });
  }
  if (!account.emailVerified || !isAllowedEmailAddress(account.email)) {
  return res.status(403).json({
    message: "Verify your email to continue.",
  });
}
  req.auth = { id: account._id.toString(), role: account.role };
  return next();
}

function parseAmenities(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 15);
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 15);
  } catch {
    return String(value).split(",").map((item) => item.trim()).filter(Boolean).slice(0, 15);
  }
}

function mapLink(value, address, city) {
  if (value) {
    let url;
    try {
      url = new URL(value);
    } catch {
      throw new Error("Enter a valid map URL.");
    }
    if (url.protocol !== "https:" || !(url.hostname === "google.com" || url.hostname.endsWith(".google.com") || url.hostname === "maps.app.goo.gl")) {
      throw new Error("Use a secure Google Maps directions link.");
    }
    return url.toString();
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${address} ${city}`)}`;
}

function listingPayload(body, files, owner) {
  const media = (files || []).map((file) => ({
    url: `/uploads/${file.filename}`,
    type: file.mimetype.startsWith("video/") ? "video" : "image",
  }));
  return {
    title: body.title,
    description: body.description,
    city: body.city,
    address: body.address,
    rent: Number(body.rent),
    deposit: Number(body.deposit),
    bedrooms: Number(body.bedrooms),
    bathrooms: Number(body.bathrooms),
    propertyType: body.propertyType || "Apartment",
    availableFrom: body.availableFrom,
    amenities: parseAmenities(body.amenities),
    media,
    mapUrl: mapLink(body.mapUrl, body.address, body.city),
    owner: owner._id,
    ownerName: owner.name,
    ownerEmail: owner.email,
  };
}

function publicListing(listing) {
  const result = listing.toObject();
  delete result.ownerEmail;
  return result;
}

app.get("/api/health", (_req, res) => {
  const connected = mongoose.connection.readyState === 1;
  res.status(connected ? 200 : 503).json({
    success: connected,
    message: connected ? "RentNest API is ready." : "Database is not connected.",
    database: connected ? "connected" : "disconnected",
  });
});

app.post("/api/auth/register", authLimiter, async (req, res) => {
  const { name, email, password, role } = req.body;

  if (
    typeof name !== "string" ||
    name.trim().length < 2 ||
    name.trim().length > 80
  ) {
    return res.status(400).json({
      message: "Enter a name between 2 and 80 characters.",
    });
  }

  if (!isAllowedEmailAddress(email)) {
    return res.status(400).json({
      message: "Enter a real email address you can access.",
    });
  }

  if (
    typeof password !== "string" ||
    password.length < 8 ||
    password.length > 72
  ) {
    return res.status(400).json({
      message: "Password must be between 8 and 72 characters.",
    });
  }

  if (role !== undefined && !["renter", "owner"].includes(role)) {
    return res.status(400).json({
      message: "Choose renter or owner account type.",
    });
  }

  const normalizedEmail = email.trim().toLowerCase();

  const existingUser = await User.findOne({
    email: normalizedEmail,
  }).lean();

  if (existingUser) {
    return res.status(409).json({
      message: "An account with that email already exists.",
    });
  }

  if (!(await validateEmailDeliverability(normalizedEmail))) {
    return res.status(400).json({
      message: "That email does not appear to be an existing, deliverable inbox. Use an email address you can access.",
    });
  }

  const user = await User.create({
    name: name.trim(),
    email: normalizedEmail,
    passwordHash: await bcrypt.hash(password, 12),
    role: role || "renter",
  });

  try {
    await sendEmailCode(user);

    return res.status(201).json({
      message: "A verification code has been sent to your email.",
      user: publicUser(user),
      verificationRequired: true,
      delivery: { email: true },
    });
  } catch (error) {
    console.error("Registration email delivery failed:", error.message);

    return res.status(503).json({
      message:
        "Your account was created, but the email verification code could not be sent. Please request a new code.",
      user: publicUser(user),
      verificationRequired: true,
      delivery: { email: false },
    });
  }
});

app.post("/api/auth/login", authLimiter, async (req, res) => {
  const { email, password } = req.body;

  if (
    !isAllowedEmailAddress(email) ||
    typeof password !== "string" ||
    password.length > 72
  ) {
    return res.status(400).json({
      message: "Enter your email and password.",
    });
  }

  const user = await User.findOne({
    email: email.trim().toLowerCase(),
  }).select("+passwordHash");

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({
      message: "Email or password is incorrect.",
    });
  }

  if (!user.emailVerified) {
    return res.status(403).json({
      message: "Verify your email before signing in.",
      ...authPayload(user),
    });
  }

  return res.json(authPayload(user));
});

app.post("/api/auth/logout", requireAuth, async (req, res) => {
  const result = await User.updateOne({ _id: req.auth.id }, { $inc: { tokenVersion: 1 } });
  if (!result.matchedCount) return res.status(401).json({ message: "This account is no longer available." });
  io.in(`user:${req.auth.id}`).disconnectSockets(true);
  return res.json({ message: "Signed out. Your active sessions have been revoked." });
});

app.post("/api/auth/verify-email", authLimiter, async (req, res) => {
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const code = typeof req.body.code === "string" ? req.body.code.trim() : "";
  if (!isAllowedEmailAddress(email) || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ message: "Enter a real email address and the 6-digit code." });
  }
  const user = await User.findOne({ email });
  if (!user) return res.status(400).json({ message: "The email or verification code is incorrect." });
  if (user.emailVerified) return res.json(authPayload(user));

  const emailCode = await EmailCode.findOne({ user: user._id, expiresAt: { $gt: new Date() } });
  if (!emailCode) return res.status(400).json({ message: "That email code expired. Request a new one." });
  if (emailCode.attempts >= 5) return res.status(429).json({ message: "Too many incorrect codes. Request a new one." });
  emailCode.attempts += 1;
  await emailCode.save();
  const submittedHash = Buffer.from(verificationHash(user._id, code), "hex");
  const expectedHash = Buffer.from(emailCode.codeHash, "hex");
  if (submittedHash.length !== expectedHash.length || !crypto.timingSafeEqual(submittedHash, expectedHash)) {
    return res.status(400).json({ message: "That email code is incorrect." });
  }
  await EmailCode.deleteOne({ _id: emailCode._id });
  user.emailVerified = true;
  await user.save();
  return res.json({ message: "Email verified.", ...authPayload(user) });
});



app.post("/api/auth/resend-verification", resendLimiter, async (req, res) => {
  const email =
    typeof req.body.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "";

  if (!isAllowedEmailAddress(email)) {
    return res.status(400).json({
      message: "Enter a real email address you can access.",
    });
  }

  const user = await User.findOne({ email });

  if (!user) {
    return res.json({
      message: "If the account exists, a new verification code will be sent.",
    });
  }

  if (user.emailVerified) {
    return res.status(400).json({
      message: "This email address is already verified.",
    });
  }

  if (!(await validateEmailDeliverability(email))) {
    return res.status(400).json({
      message: "That email does not appear to be an existing, deliverable inbox. No verification code was sent.",
    });
  }

  await sendEmailCode(user);

  return res.json({
    message: "A new email verification code was sent.",
  });
});


app.get("/api/listings", async (req, res) => {
  const filter = { status: "available", $and: [{ city: { $regex: "bengaluru|bangalore", $options: "i" } }] };
  if (req.query.city !== undefined) {
    if (typeof req.query.city !== "string" || req.query.city.trim().length > 100) {
      return res.status(400).json({ message: "Enter a neighborhood up to 100 characters." });
    }
    if (req.query.city.trim()) {
      const city = req.query.city.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$and.push({ city: { $regex: city, $options: "i" } });
    }
  }
  if (req.query.maxRent !== undefined) {
    const maxRent = Number(req.query.maxRent);
    if (typeof req.query.maxRent !== "string" || !req.query.maxRent.trim() || !Number.isFinite(maxRent) || maxRent < 0 || maxRent > 1000000) {
      return res.status(400).json({ message: "Enter a valid maximum rent." });
    }
    filter.rent = { $lte: maxRent };
  }
  if (req.query.type !== undefined) {
    const propertyTypes = ["Apartment", "House", "Room", "Loft", "Townhouse", "Studio"];
    if (typeof req.query.type !== "string" || !propertyTypes.includes(req.query.type)) {
      return res.status(400).json({ message: "Choose a valid property type." });
    }
    filter.propertyType = req.query.type;
  }
  if (req.query.category !== undefined) {
    const categories = {
      apartments: { propertyType: "Apartment" },
      houses: { propertyType: { $in: ["House", "Townhouse"] } },
      rooms: { propertyType: "Room" },
      "pet-friendly": { amenities: { $regex: "pet", $options: "i" } },
    };
    if (typeof req.query.category !== "string" || !Object.hasOwn(categories, req.query.category)) {
      return res.status(400).json({ message: "Choose a valid home category." });
    }
    Object.assign(filter, categories[req.query.category]);
  }
  if (req.query.bedrooms !== undefined) {
    const bedrooms = Number(req.query.bedrooms);
    if (typeof req.query.bedrooms !== "string" || !req.query.bedrooms.trim() || !Number.isFinite(bedrooms) || bedrooms < 0 || bedrooms > 50) {
      return res.status(400).json({ message: "Enter a valid minimum bedroom count." });
    }
    filter.bedrooms = { $gte: bedrooms };
  }
  if (req.query.q !== undefined) {
    if (typeof req.query.q !== "string" || req.query.q.trim().length > 100) {
      return res.status(400).json({ message: "Search text must be 100 characters or fewer." });
    }
    const query = req.query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (query) {
    filter.$or = [
      { title: { $regex: query, $options: "i" } },
      { description: { $regex: query, $options: "i" } },
      { city: { $regex: query, $options: "i" } },
      { address: { $regex: query, $options: "i" } },
    ];
    }
  }
  const listings = await Listing.find(filter).select("-ownerEmail").sort({ createdAt: -1 }).limit(100).lean();
  return res.json({ listings });
});

app.get("/api/listings/mine", requireAuth, async (req, res) => {
  const listings = await Listing.find({ owner: req.auth.id }).sort({ createdAt: -1 }).lean();
  return res.json({ listings });
});

app.post("/api/listings", requireAuth, (req, res, next) => {
  if (req.auth.role !== "owner") return res.status(403).json({ message: "Create an owner account to publish a home." });
  return next();
}, upload.array("media", 10), async (req, res) => {
  const owner = await User.findById(req.auth.id);
  if (!owner || owner.role !== "owner") return res.status(403).json({ message: "An owner account is required to publish a home." });
  const listing = await Listing.create(listingPayload(req.body, req.files, owner));
  const result = publicListing(listing);
  io.emit("listing:created", result);
  return res.status(201).json({ listing: result });
});

app.put("/api/listings/:id", requireAuth, async (req, res, next) => {
  if (req.auth.role !== "owner") return res.status(403).json({ message: "Only owners can edit listings." });
  const ownsListing = await Listing.exists({ _id: req.params.id, owner: req.auth.id });
  if (!ownsListing) return res.status(404).json({ message: "Listing not found." });
  return next();
}, upload.array("media", 10), async (req, res) => {
  const listing = await Listing.findOne({ _id: req.params.id, owner: req.auth.id });
  if (!listing) return res.status(404).json({ message: "Listing not found." });
  const owner = await User.findById(req.auth.id);
  const payload = listingPayload(req.body, req.files, owner);
  const editableFields = ["title", "description", "city", "address", "rent", "deposit", "bedrooms", "bathrooms", "propertyType", "availableFrom", "amenities", "mapUrl"];
  editableFields.forEach((field) => {
    if (req.body[field] !== undefined) listing[field] = payload[field];
  });
  if (req.files?.length) listing.media.push(...payload.media);
  if (req.body.status && ["available", "rented"].includes(req.body.status)) listing.status = req.body.status;
  await listing.save();
  const result = publicListing(listing);
  io.emit("listing:updated", result);
  return res.json({ listing: result });
});

app.post("/api/inquiries", requireAuth, async (req, res) => {
  const { listingId, message, moveInDate } = req.body;
  if (!mongoose.isValidObjectId(listingId)) return res.status(400).json({ message: "Choose a valid home to contact." });
  if (typeof message !== "string" || message.trim().length < 10 || message.trim().length > 1500) {
    return res.status(400).json({ message: "Your message should be between 10 and 1,500 characters." });
  }
  const listing = await Listing.findOne({ _id: listingId, status: "available" });
  if (!listing) return res.status(404).json({ message: "This home is no longer available." });
  if (listing.owner.toString() === req.auth.id) return res.status(400).json({ message: "You cannot message yourself about your own listing." });
  const renter = await User.findById(req.auth.id).select("name email").lean();
  if (!renter) return res.status(401).json({ message: "Sign in to continue." });
  const inquiry = await Inquiry.create({
    listing: listing._id,
    owner: listing.owner,
    renter: req.auth.id,
    message: message.trim(),
    moveInDate: typeof moveInDate === "string" ? moveInDate.slice(0, 10) : "",
  });
  io.to(`user:${listing.owner.toString()}`).emit("inquiry:created", {
    id: inquiry._id.toString(),
    message: inquiry.message,
    moveInDate: inquiry.moveInDate,
    createdAt: inquiry.createdAt,
    renter: { id: renter._id.toString(), name: renter.name, email: renter.email },
    listing: { id: listing._id.toString(), title: listing.title, city: listing.city },
  });
  return res.status(201).json({ inquiry: { id: inquiry._id, createdAt: inquiry.createdAt } });
});

app.get("/api/inquiries/inbox", requireAuth, async (req, res) => {
  if (req.auth.role !== "owner") return res.status(403).json({ message: "Only owners can view listing inquiries." });
  const inquiries = await Inquiry.find({ owner: req.auth.id })
    .sort({ createdAt: -1 })
    .populate("renter", "name email")
    .populate("listing", "title city address")
    .lean();
  return res.json({
    inquiries: inquiries.map((inquiry) => ({
      id: inquiry._id,
      message: inquiry.message,
      moveInDate: inquiry.moveInDate,
      createdAt: inquiry.createdAt,
      renter: inquiry.renter,
      listing: inquiry.listing,
    })),
  });
});

app.use((error, _req, res, _next) => {
  if (error.status && error.status >= 400 && error.status < 600) {
    return res.status(error.status).json({ message: error.message });
  }
  if (error instanceof multer.MulterError) {
    const message = error.code === "LIMIT_FILE_SIZE"
      ? "Each photo or video must be no larger than 25 MB."
      : error.code === "LIMIT_FILE_COUNT"
        ? "Upload up to 10 photos or videos."
        : "The media upload could not be processed.";
    return res.status(400).json({ message });
  }
  if (error.message?.startsWith("Upload ") || error.message === "Enter a valid map URL." || error.message === "Use a secure Google Maps directions link.") {
    return res.status(400).json({ message: error.message });
  }
  if (error.name === "ValidationError") return res.status(400).json({ message: error.message });
  if (error.name === "CastError") return res.status(400).json({ message: "Invalid listing details." });
  if (error.code === 11000) {
    const message = error.keyPattern?.phone
      ? "An account with that phone number already exists."
      : "An account with that email already exists.";
    return res.status(409).json({ message });
  }
  console.error("Request failed:", error.message);
  return res.status(500).json({ message: "Something went wrong. Please try again." });
});

async function startServer() {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required.");
  if (!JWT_SECRET || JWT_SECRET.length < 32) throw new Error("JWT_SECRET must be set to a random value of at least 32 characters.");
  try {
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
  });

  console.log("MongoDB connected successfully");
} catch (error) {
  console.error("MongoDB connection details:");

  console.error("Main error:", error.message);

  const servers = error.reason?.servers;

  if (servers) {
    for (const [address, server] of servers.entries()) {
      console.log("\nServer:", address);
      console.log("Status:", server.type);
      console.log("Error:", server.error?.message);
      console.log("Error code:", server.error?.code);
    }
  }

  throw error;
}
  httpServer.listen(PORT, () => console.log(`RentNest API running on port ${PORT}`));
}

startServer().catch((error) => {
  console.error("Backend startup failed:");
  console.error(error);
  process.exitCode = 1;
});