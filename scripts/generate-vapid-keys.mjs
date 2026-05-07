#!/usr/bin/env node
// One-off helper: generate VAPID keypair for Web Push.
// Usage: node scripts/generate-vapid-keys.mjs
// Then paste the output into Vercel env vars + .env.local
//   - NEXT_PUBLIC_VAPID_PUBLIC_KEY (Production + Preview + Development)
//   - VAPID_PRIVATE_KEY (Production + Preview + Development; SECRET)
//   - VAPID_CONTACT_EMAIL (e.g. tetraphotobooth@gmail.com)

import webpush from "web-push";

const keys = webpush.generateVAPIDKeys();

console.log("");
console.log("# === Web Push VAPID keys — paste into Vercel env vars ===");
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log(`VAPID_CONTACT_EMAIL=tetraphotobooth@gmail.com`);
console.log("");
console.log(
	"Public key bisa di-share (client butuh untuk subscribe). Private key SECRET — jangan commit.",
);
console.log("");
