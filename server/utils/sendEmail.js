
import nodemailer from "nodemailer";
import { isAllowedEmailAddress } from "./emailAddress.js";

export async function sendVerificationEmail(email, otp) {
  if (!isAllowedEmailAddress(email)) {
    throw new Error("The recipient must be a valid email address with a non-placeholder domain.");
  }

  const requiredVariables = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "EMAIL_FROM"];

  for (const variable of requiredVariables) {
    if (!process.env[variable]?.trim()) {
      throw new Error(`${variable} is missing from the environment`);
    }
  }

  const smtpPassword = process.env.SMTP_PASS || process.env.SMTP_APP_PASSWORD;
  if (!smtpPassword) {
    throw new Error("SMTP_PASS is missing from the environment");
  }
  const port = Number(process.env.SMTP_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("SMTP_PORT must be a valid port number");
  }

  const configuredSender = process.env.EMAIL_FROM.trim();
  const senderAddress = configuredSender.match(/<([^<>]+)>/)?.[1] || configuredSender;
  if (!isAllowedEmailAddress(senderAddress)) {
    throw new Error("EMAIL_FROM must contain a real email address with a non-placeholder domain.");
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: smtpPassword,
    },
  });

  return transporter.sendMail({
    from: configuredSender,
    to: email,
    subject: "Verify your RentNest email",
    text: `Your RentNest verification code is ${otp}. It expires in 5 minutes. Do not share this code with anyone.`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:24px">
        <h2>Welcome to RentNest</h2>
        <p>Use the following verification code to verify your email:</p>
        <h1 style="letter-spacing:8px">${otp}</h1>
        <p>This code expires in 5 minutes.</p>
        <p>Please do not share this code with anyone.</p>
      </div>
    `,
  });
}
