import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { catalogueRevision, importLegacyCatalogue, seedCatalogue } from "./rules.mjs";

const root = process.env.CONFIG_ROOT ?? "/config";
const dataDirectory = path.join(root, "smartfamilyops", "classification-rule-builder");
const cataloguePath = path.join(dataDirectory, "classification_rules.json");
const deviceCataloguePath = path.join(dataDirectory, "device_catalogue.json");
const backupDirectory = path.join(dataDirectory, "backups");
export const templatePath = path.join(root, "custom_templates", "smartfamilyops_device_classification.jinja");
export const deviceTemplatePath = path.join(root, "custom_templates", "smartfamilyops_device_catalogue.jinja");

async function readOptional(file) {
  try { return await readFile(file, "utf8"); } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function readCatalogue() {
  const content = await readOptional(cataloguePath);
  if (content) {
    const catalogue = JSON.parse(content);
    return { catalogue, revision: catalogueRevision(catalogue), seeded: false, imported: false };
  }
  const existingTemplate = await readOptional(templatePath);
  if (existingTemplate) {
    const migration = importLegacyCatalogue(existingTemplate);
    if (!migration.recognised) {
      throw new Error(`Existing classifier was not changed because it could not be imported safely. ${migration.reason}`);
    }
    return {
      catalogue: migration.catalogue,
      revision: catalogueRevision(migration.catalogue),
      seeded: false,
      imported: true,
      import_message: migration.message,
      imported_branch_count: migration.branch_count,
    };
  }
  const catalogue = seedCatalogue();
  return { catalogue, revision: catalogueRevision(catalogue), seeded: true, imported: false };
}

export async function publicationRequired() {
  const [deviceCatalogue, deviceTemplate] = await Promise.all([
    readOptional(deviceCataloguePath),
    readOptional(deviceTemplatePath),
  ]);
  if (!deviceCatalogue || !deviceTemplate) return true;
  try {
    return JSON.parse(deviceCatalogue).version !== 2
      || !deviceTemplate.includes("macro dashboard_devices(dashboard_id, returns)");
  } catch {
    return true;
  }
}

async function atomicWrite(file, content) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.new`;
  await writeFile(temporary, content, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, file);
}

function timestamp() {
  return new Date().toISOString().replaceAll(":", "-");
}

export async function saveFiles(catalogue, template, deviceCatalogue, deviceTemplate) {
  await mkdir(backupDirectory, { recursive: true });
  const stamp = timestamp();
  const previousCatalogue = await readOptional(cataloguePath);
  const previousTemplate = await readOptional(templatePath);
  const previousDeviceCatalogue = await readOptional(deviceCataloguePath);
  const previousDeviceTemplate = await readOptional(deviceTemplatePath);
  if (previousCatalogue) await writeFile(path.join(backupDirectory, `${stamp}.catalogue.json`), previousCatalogue, { mode: 0o600 });
  if (previousTemplate) await writeFile(path.join(backupDirectory, `${stamp}.template.jinja`), previousTemplate, { mode: 0o600 });
  if (previousDeviceCatalogue) await writeFile(path.join(backupDirectory, `${stamp}.device-catalogue.json`), previousDeviceCatalogue, { mode: 0o600 });
  if (previousDeviceTemplate) await writeFile(path.join(backupDirectory, `${stamp}.device-template.jinja`), previousDeviceTemplate, { mode: 0o600 });
  const previous = { previousCatalogue, previousTemplate, previousDeviceCatalogue, previousDeviceTemplate };
  try {
    await atomicWrite(cataloguePath, `${JSON.stringify(catalogue, null, 2)}\n`);
    await atomicWrite(templatePath, template);
    await atomicWrite(deviceCataloguePath, `${JSON.stringify(deviceCatalogue, null, 2)}\n`);
    await atomicWrite(deviceTemplatePath, deviceTemplate);
  } catch (error) {
    await restoreFiles(previous);
    throw error;
  }
  return previous;
}

export async function restoreFiles(previous) {
  if (previous.previousCatalogue !== null) await atomicWrite(cataloguePath, previous.previousCatalogue);
  else await rm(cataloguePath, { force: true });
  if (previous.previousTemplate !== null) await atomicWrite(templatePath, previous.previousTemplate);
  else await rm(templatePath, { force: true });
  if (previous.previousDeviceCatalogue !== null) await atomicWrite(deviceCataloguePath, previous.previousDeviceCatalogue);
  else await rm(deviceCataloguePath, { force: true });
  if (previous.previousDeviceTemplate !== null) await atomicWrite(deviceTemplatePath, previous.previousDeviceTemplate);
  else await rm(deviceTemplatePath, { force: true });
}

export async function pruneBackups() {
  const limit = Number(process.env.BACKUP_LIMIT ?? "20");
  const names = (await readdir(backupDirectory)).sort().reverse();
  for (const name of names.slice(limit * 4)) await rm(path.join(backupDirectory, name), { force: true });
}

export function pathsForStatus() {
  return { catalogue: cataloguePath, template: templatePath, device_catalogue: deviceCataloguePath, device_template: deviceTemplatePath, backups: backupDirectory };
}
