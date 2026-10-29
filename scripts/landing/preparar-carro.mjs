// Prepara el carro del estudio de color de la página de inicio (src/landing/assets/restorify-car.glb)
// a partir de "Car Concept" de los glTF Sample Assets de Khronos: Eric Chadwick, © 2024 Darmstadt
// Graphics Group GmbH, CC BY 4.0, basado en un modelo de dominio público de Unity Fan. La licencia pide
// el crédito (va en el pie de la página) y excluye los logos de Khronos, que este script quita.
//
// Sus dependencias no son del proyecto: se corre en una carpeta aparte.
//   mkdir carro && cd carro && npm init -y
//   npm i @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 meshoptimizer@0.25 sharp@0.35
//   curl -LO https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/CarConcept/glTF-Binary/CarConcept.glb
//   cp <repo>/scripts/landing/preparar-carro.mjs . && node preparar-carro.mjs CarConcept.glb restorify-car.glb
// (sharp tiene que ser la misma versión que trae @gltf-transform/functions: dos libvips en el mismo
// proceso fallan con "colourspace: parameter space not set").
//
// Qué hace, y por qué:
// - Quita los logos de Khronos (placa, calcomanías emisivas en rines, espejos y frenos, y el costado
//   de las llantas): la licencia del modelo excluye sus logos y marcas.
// - Quita el interior, los limpiaparabrisas (30 mil vértices) y lo que no se ve con los vidrios
//   oscuros: la página nunca abre el carro.
// - Quita las variantes de pintura, la iridiscencia y la transmisión: la pintura y el vidrio los pone
//   la página.
// - Simplifica, pasa las texturas a WebP y comprime la geometría con meshopt.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplify, meshopt, resample } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('Uso: node preparar-carro.mjs <CarConcept.glb> <salida.glb>');
  process.exit(1);
}

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(input);
const root = doc.getRoot();

// 1. Piezas que no se ven o que traen logos.
const DROP = [/^Interior/, /^License Plate$/, /^BodyWindshieldWipers/, /^Engine$/, /^BodyHoodInterior/, /^BodyHoodUnder$/];
for (const node of root.listNodes()) {
  if (DROP.some((re) => re.test(node.getName()))) node.dispose();
}

// 2. La textura del logo de Khronos (la única de 512×128 usada como base de la placa) y
//    cualquier emisiva que la use.
const logo = root.listTextures().find((t) => {
  const [w, h] = t.getSize() ?? [0, 0];
  return w === 512 && h === 128 && root.listMaterials().some((m) => m.getBaseColorTexture() === t);
});
if (!logo) throw new Error('No encontré la textura del logo: ¿cambió el modelo de origen?');
for (const m of root.listMaterials()) {
  if (m.getEmissiveTexture() === logo) {
    m.setEmissiveTexture(null);
    m.setEmissiveFactor([0, 0, 0]);
  }
  if (m.getBaseColorTexture() === logo) m.setBaseColorTexture(null);
}
logo.dispose();

// Los costados de las llantas traen los logos de Khronos y de 3D Commerce, en el color y en relieve:
// quedan de hule liso.
const tireSide = root.listMaterials().find((m) => m.getName() === 'Tireside');
if (!tireSide) throw new Error('No encontré el material Tireside: ¿cambió el modelo de origen?');
tireSide.setBaseColorTexture(null).setNormalTexture(null).setBaseColorFactor([0.035, 0.035, 0.037, 1]);

// 3. Extensiones que la página no usa.
for (const ext of root.listExtensionsUsed()) {
  if (['KHR_materials_variants', 'KHR_materials_iridescence', 'KHR_materials_transmission'].includes(ext.extensionName)) {
    ext.dispose();
  }
}

// 4. Limpieza y simplificación.
await doc.transform(
  prune(),
  dedup(),
  resample(),
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: 0.5, error: 0.0004, lockBorder: true }),
  prune(),
);

// 5. Texturas a WebP, de 1024 px como máximo. (textureCompress de gltf-transform falla con esta
//    combinación de sharp y libvips, así que se hace aquí, textura por textura.)
doc.createExtension(EXTTextureWebP).setRequired(true);
for (const texture of root.listTextures()) {
  const [w, h] = texture.getSize() ?? [0, 0];
  const scale = Math.min(1, 1024 / Math.max(w, h));
  // Pasar por píxeles crudos evita el error de espacio de color de libvips con algunas PNG en gris.
  const { data, info } = await sharp(texture.getImage()).raw().toBuffer({ resolveWithObject: true });
  let pipeline = sharp(data, { raw: info });
  if (scale < 1) pipeline = pipeline.resize(Math.round(w * scale), Math.round(h * scale));
  const image = await pipeline.webp({ quality: 82 }).toBuffer();
  texture.setImage(new Uint8Array(image)).setMimeType('image/webp');
  texture.setURI(texture.getURI().replace(/\.\w+$/, '.webp'));
}

// 6. Geometría comprimida (EXT_meshopt_compression); la página la lee con MeshoptDecoder.
await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));

await io.write(output, doc);

const verts = root.listMeshes().reduce(
  (n, mesh) => n + mesh.listPrimitives().reduce((k, p) => k + (p.getAttribute('POSITION')?.getCount() ?? 0), 0),
  0,
);
console.log(`ok: ${root.listMeshes().length} mallas, ${verts} vértices, ${root.listTextures().length} texturas, ${root.listMaterials().length} materiales`);
for (const m of root.listMaterials()) console.log(' -', m.getName());
