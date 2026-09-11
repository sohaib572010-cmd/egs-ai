// EGS AI — Automated Test for Apology & 15-Point Compensation Logic
import { APOLOGY_CUTOFF_DATE, isExistingAccountForApology, db } from '../src/lib/db.ts';

async function runTests() {
  console.log('--- Starting Apology & 15-Point Compensation Verification ---');
  console.log('Cutoff timestamp:', APOLOGY_CUTOFF_DATE);

  // 1. Verify isExistingAccountForApology helper
  const legacyProfile = { id: 'test_legacy' };
  const pastProfile = { id: 'test_past', created_at: '2026-09-03T16:07:15.807Z' };
  const futureProfile = { id: 'test_future', created_at: '2026-09-12T10:00:00.000Z' };
  const exactCutoffProfile = { id: 'test_cutoff', created_at: APOLOGY_CUTOFF_DATE };

  if (!isExistingAccountForApology(legacyProfile)) {
    throw new Error('Test failed: Legacy profile should be identified as existing account');
  }
  if (!isExistingAccountForApology(pastProfile)) {
    throw new Error('Test failed: Past profile should be identified as existing account');
  }
  if (!isExistingAccountForApology(exactCutoffProfile)) {
    throw new Error('Test failed: Cutoff profile should be identified as existing account');
  }
  if (isExistingAccountForApology(futureProfile)) {
    throw new Error('Test failed: Future profile should NOT be identified as existing account');
  }
  console.log('PASS: isExistingAccountForApology correctly discriminates existing vs new accounts');

  // 2. Test createProfile defaults for brand-new users
  const newUserId = 'test_new_user_' + Date.now();
  const createdNew = await db.createProfile({
    id: newUserId,
    email: `${newUserId}@test.egsaiedu.com`,
    name: 'طالب جديد اختباري',
    grade_level: '1_high',
    plan_type: 'free',
    role: 'student',
    password_hash: 'dummyhash',
    coins: 20.0
  });

  if (createdNew.apology_dismissed !== true) {
    throw new Error('Test failed: Brand new profile must have apology_dismissed = true');
  }
  if (createdNew.apology_compensation_claimed !== false) {
    throw new Error('Test failed: Brand new profile must have apology_compensation_claimed = false');
  }
  console.log('PASS: createProfile initializes brand-new users with apology_dismissed = true');

  // 3. Test that brand-new users cannot claim compensation
  const newClaimAttempt = await db.claimApologyCompensation(newUserId);
  if (newClaimAttempt.success) {
    throw new Error('Test failed: Brand new profile must be rejected from claiming compensation');
  }
  console.log('PASS: Brand new user cannot claim compensation (error:', newClaimAttempt.error, ')');

  // 4. Test existing user claiming 15 points
  const existingUserId = 'test_existing_user_' + Date.now();
  // Insert simulated existing account created in the past
  const existingUser = await db.createProfile({
    id: existingUserId,
    email: `${existingUserId}@test.egsaiedu.com`,
    name: 'طالب قديم اختباري',
    grade_level: '1_high',
    plan_type: 'free',
    role: 'student',
    password_hash: 'dummyhash',
    coins: 10.0
  });
  // Retroactively backdate created_at and reset apology_dismissed for this test
  existingUser.created_at = '2026-09-01T12:00:00.000Z';
  existingUser.apology_dismissed = false;
  existingUser.apology_compensation_claimed = false;

  // Claim compensation
  const claimResult = await db.claimApologyCompensation(existingUserId);
  if (!claimResult.success) {
    throw new Error('Test failed: Existing profile should successfully claim compensation');
  }
  if (claimResult.profile.coins !== 25.0) {
    throw new Error(`Test failed: Expected 25.0 coins (10.0 + 15.0), got ${claimResult.profile.coins}`);
  }
  if (!claimResult.profile.apology_compensation_claimed) {
    throw new Error('Test failed: apology_compensation_claimed should be true after claim');
  }
  if (!claimResult.profile.apology_dismissed) {
    throw new Error('Test failed: apology_dismissed should be true after claim');
  }
  console.log('PASS: Existing user claimed 15 points (coins:', claimResult.profile.coins, ')');

  // 5. Test anti-double-claim prevention
  const doubleClaimResult = await db.claimApologyCompensation(existingUserId);
  if (doubleClaimResult.success) {
    throw new Error('Test failed: Double-claiming must be strictly rejected');
  }
  console.log('PASS: Double claiming prevented (error:', doubleClaimResult.error, ')');

  // 6. Test dismissal for another existing user
  const dismissUserId = 'test_dismiss_user_' + Date.now();
  const dismissUser = await db.createProfile({
    id: dismissUserId,
    email: `${dismissUserId}@test.egsaiedu.com`,
    name: 'طالب إغلاق اختباري',
    grade_level: '1_high',
    plan_type: 'free',
    role: 'student',
    password_hash: 'dummyhash',
    coins: 5.0
  });
  dismissUser.created_at = '2026-09-01T12:00:00.000Z';
  dismissUser.apology_dismissed = false;

  const dismissOk = await db.dismissApology(dismissUserId);
  if (!dismissOk) {
    throw new Error('Test failed: dismissApology returned false');
  }
  const reloadedDismiss = await db.getProfile(dismissUserId);
  if (!reloadedDismiss.apology_dismissed) {
    throw new Error('Test failed: apology_dismissed should be true after dismissApology');
  }
  console.log('PASS: Existing user dismissed apology successfully');

  console.log('--- All Apology & Compensation Tests PASSED Successfully! ---');
}

runTests().catch(err => {
  console.error('Test FAILED:', err);
  process.exit(1);
});
