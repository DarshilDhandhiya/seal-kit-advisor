import fs from 'node:fs';
import path from 'node:path';
import type { CatalogRepo, FitmentRec, KitRec, MachineRec, AssemblyRec } from '../src/services/fitment.js';

export const seed = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'data/seed.json'), 'utf8'));

export function memoryRepo(over: Partial<{ machines: MachineRec[]; assemblies: AssemblyRec[]; kits: KitRec[]; fitments: FitmentRec[] }> = {}): CatalogRepo {
  const machines: MachineRec[] = over.machines ?? seed.machines;
  const assemblies: AssemblyRec[] = over.assemblies ?? seed.assemblies;
  const kits: KitRec[] = over.kits ?? seed.kits;
  const fitments: FitmentRec[] = over.fitments ?? seed.fitments;
  return {
    async findMachine(s) {
      return machines.find((m) => m.serial === s) ?? null;
    },
    async findAssembly(c) {
      return assemblies.find((a) => a.code === c) ?? null;
    },
    async findFitments(s, a) {
      return fitments.filter((f) => f.machineSerial === s && f.assemblyCode === a);
    },
    async findKits(skus) {
      return kits.filter((k) => skus.includes(k.sku));
    },
  };
}

export const plate = (name: string) => fs.readFileSync(path.resolve(process.cwd(), 'fixtures/plates', name));
