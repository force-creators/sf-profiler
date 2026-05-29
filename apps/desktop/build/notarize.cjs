const { notarize } = require('@electron/notarize');

const appBundleId = 'com.sfdc.profiler';

exports.default = async function notarizeMacApp(context) {
  if (process.platform !== 'darwin') {
    return;
  }

  const appleId = process.env.APPLE_ID;
  const appleAppSpecificPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const appleTeamId = process.env.APPLE_TEAM_ID;

  if (!appleId || !appleAppSpecificPassword || !appleTeamId) {
    return;
  }

  const appPath = `${context.appOutDir}/${context.packager.appInfo.productFilename}.app`;

  await notarize({
    appBundleId,
    appPath,
    appleId,
    appleIdPassword: appleAppSpecificPassword,
    teamId: appleTeamId,
  });
};