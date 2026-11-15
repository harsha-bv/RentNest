const API_URL = "https://emailvalidation.abstractapi.com/v1/";

function serviceError(message) {
  const error = new Error(message);
  error.status = 503;
  return error;
}

export function isDeliverableEmailResult(result) {
  return Boolean(
    result
    && result.deliverability === "DELIVERABLE"
    && result.is_valid_format === true
    && result.is_mx_found === true
    && result.is_smtp_valid === true
    && result.is_disposable_email === false
    && result.is_catchall_email === false
  );
}

export async function validateEmailDeliverability(email) {
  const apiKey = process.env.ABSTRACT_API_KEY?.trim();
  if (!apiKey) {
    throw serviceError("Email validation is not configured. Set ABSTRACT_API_KEY in server/.env.");
  }

  const url = new URL(API_URL);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("email", email);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  let response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch {
    throw serviceError("The email validation service is unavailable. No verification code was sent.");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    console.error(`Abstract email validation returned HTTP ${response.status}.`);
    throw serviceError("The email validation service could not complete the check. No verification code was sent.");
  }

  let result;
  try {
    result = await response.json();
  } catch {
    console.error("Abstract email validation returned an unreadable response.");
    throw serviceError("The email validation service returned an invalid response. No verification code was sent.");
  }

  if (!result || typeof result.deliverability !== "string" || typeof result.is_valid_format !== "boolean") {
    console.error("Abstract email validation returned an unexpected response shape.");
    throw serviceError("The email validation service returned an invalid response. No verification code was sent.");
  }

  return isDeliverableEmailResult(result);
}
