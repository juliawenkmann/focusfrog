// Creates the test account in the local Firebase Auth emulator (`npm run emulators`).
// Emulator only: these values never reach the real FocusFrog project.
// The rules allow only the owner's account id and email, so the emulator account uses both.
export const EMULATOR_ACCOUNT = {
  localId: 'lAsGU1pK6AX2CHl408knqFYtLYq2',
  email: 'juliawenkmann@gmail.com',
  password: 'focusfrog-emulator-test',
};

const AUTH_EMULATOR = 'http://127.0.0.1:9099';

async function main() {
  const response = await fetch(
    // The admin form of sign-up, which lets the account have the owner's id.
    `${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/projects/demo-focusfrog/accounts`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer owner' },
      body: JSON.stringify(EMULATOR_ACCOUNT),
    }
  );
  const payload = await response.json();
  if (response.ok) {
    console.log(`Emulator account ready: ${EMULATOR_ACCOUNT.email}`);
  } else if (['EMAIL_EXISTS', 'DUPLICATE_LOCAL_ID'].includes(payload?.error?.message)) {
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
