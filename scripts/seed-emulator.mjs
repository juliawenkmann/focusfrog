// Creates the test account in the local Firebase Auth emulator (`npm run emulators`).
// Emulator only: these values never reach the real FocusFrog project.
// The rules allow only the owner email, so the emulator account uses it too.
export const EMULATOR_ACCOUNT = {
  email: 'juliawenkmann@gmail.com',
  password: 'focusfrog-emulator-test',
};

const AUTH_EMULATOR = 'http://127.0.0.1:9099';

async function main() {
  const response = await fetch(
    `${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-focusfrog-key`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...EMULATOR_ACCOUNT, returnSecureToken: false }),
    }
  );
  const payload = await response.json();
  if (response.ok) {
    console.log(`Emulator account ready: ${EMULATOR_ACCOUNT.email}`);
  } else if (payload?.error?.message === 'EMAIL_EXISTS') {
    console.log(`Emulator account already exists: ${EMULATOR_ACCOUNT.email}`);
  } else {
    throw new Error(`Could not create the emulator account: ${JSON.stringify(payload)}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}
