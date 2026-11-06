import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const [email, password, name = "ABC Tours Admin"] = process.argv.slice(2);
if (!email || !password) {
  console.error('Usage: seed-admin.ts <email> <password> ["Full Name"]');
  process.exit(1);
}

initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  }),
});

const auth = getAuth();
const db = getFirestore();

async function main() {
  let uid: string;
  try {
    const existing = await auth.getUserByEmail(email);
    uid = existing.uid;
    await auth.updateUser(uid, { password, displayName: name });
  } catch (e) {
    if ((e as { code?: string }).code !== "auth/user-not-found") throw e;
    uid = (await auth.createUser({ email, password, displayName: name })).uid;
  }

  await auth.setCustomUserClaims(uid, { role: "admin" });
  await db.collection("users").doc(uid).set(
    {
      email,
      name,
      role: "admin",
      active: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  console.log(`Admin ready: ${email} (uid: ${uid})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});