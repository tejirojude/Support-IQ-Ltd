const readBody = async (req) =>
  new Promise((resolve, reject) => {
    let raw = "";

    req.on("data", (chunk) => {
      raw += chunk;
    });

    req.on("end", () => {
      resolve(raw);
    });

    req.on("error", reject);
  });

const sendJson = (res, statusCode, payload) => {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
};

const parsePayload = async (req) => {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  const raw = typeof req.body === "string" ? req.body : await readBody(req);

  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { message: "Method not allowed." });
    return;
  }

  const body = await parsePayload(req);

  const payload = {
    name: String(body.name || "").trim(),
    email: String(body.email || "").trim(),
    phone: String(body.phone || "").trim(),
    location: String(body.location || "").trim(),
    service: String(body.service || "").trim(),
    preferredContact: String(body.preferredContact || "").trim(),
    message: String(body.message || "").trim(),
    consent: Boolean(body.consent),
  };

  if (!payload.name || !payload.email || !payload.service || !payload.message || !payload.consent) {
    sendJson(res, 400, {
      message: "Please complete the required fields before sending your enquiry.",
    });
    return;
  }

  console.log(
    "SupportIQ enquiry",
    JSON.stringify({
      ...payload,
      receivedAt: new Date().toISOString(),
    }),
  );

  if (process.env.RESEND_API_KEY && process.env.CONTACT_TO_EMAIL) {
    const html = `
      <h2>New SupportIQ enquiry</h2>
      <p><strong>Name:</strong> ${payload.name}</p>
      <p><strong>Email:</strong> ${payload.email}</p>
      <p><strong>Phone:</strong> ${payload.phone || "Not provided"}</p>
      <p><strong>Location:</strong> ${payload.location || "Not provided"}</p>
      <p><strong>Service:</strong> ${payload.service}</p>
      <p><strong>Preferred contact:</strong> ${payload.preferredContact || "Not specified"}</p>
      <p><strong>Message:</strong></p>
      <p>${payload.message.replace(/\n/g, "<br />")}</p>
    `;

    try {
      const resendResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.CONTACT_FROM_EMAIL || "SupportIQ <onboarding@resend.dev>",
          to: [process.env.CONTACT_TO_EMAIL],
          reply_to: payload.email,
          subject: `New SupportIQ enquiry from ${payload.name}`,
          html,
        }),
      });

      if (!resendResponse.ok) {
        const errorText = await resendResponse.text();
        console.error("Resend email failed", errorText);
      }
    } catch (error) {
      console.error("Resend request error", error);
    }
  }

  sendJson(res, 200, {
    message: "Thanks — your enquiry has been submitted successfully.",
  });
};
