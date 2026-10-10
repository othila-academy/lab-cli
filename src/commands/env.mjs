import { endpointUrl, loadSession } from '../config.mjs';
import { formatEnvChecks, REQUIRED_CHECKS, runEnvChecks } from '../env.mjs';
import { createReporter, describeFlush } from '../reporter.mjs';

export async function run({ flags, io }) {
  const config = loadSession();
  const endpoint = flags.endpoint ?? config?.endpoint ?? endpointUrl();
  const checks = await runEnvChecks({ endpoint });
  io.out(`environnement · endpoint ${endpoint}`);
  for (const line of formatEnvChecks(checks)) io.out(line);

  const reporter = createReporter({ config, enabled: !flags['no-report'] });
  reporter.record('env.checked', { payload: { checks } });
  io.out(describeFlush(await reporter.flush(), reporter.connected));

  return checks.filter((c) => REQUIRED_CHECKS.includes(c.id)).every((c) => c.ok) ? 0 : 1;
}
