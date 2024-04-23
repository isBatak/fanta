import crypto from 'crypto';
import fsExtra from 'fs-extra';
import * as path from 'node:path';
import { writeIfChanged } from '../utils/validations';
import { loadConfig, optimize } from 'svgo';
import { calculateFileSizeInKB } from '../utils/file';
import { generateSvgSprite } from './generate-svg-sprite';
import { iconName } from './icon-name';

interface GenerateIconFilesOptions {
  files: Array<string>;
  inputDir: string;
  outputDir: string;
  spriteOutputDir: string;
  shouldOptimize?: boolean;
  shouldHash?: boolean;
  force?: boolean;
}

export async function generateIconFiles({
  files,
  inputDir,
  outputDir,
  spriteOutputDir,
  shouldOptimize,
  shouldHash,
  force,
}: GenerateIconFilesOptions) {
  const spriteFilepath = path.join(spriteOutputDir, 'sprite.svg');
  const typesDir = path.join(outputDir, 'types');
  const typeOutputFilepath = path.join(typesDir, 'icon-name.d.ts');

  await fsExtra.ensureDir(typesDir);

  const currentSprite = await fsExtra
    .readFile(spriteFilepath, 'utf8')
    .catch(() => '');
  const currentTypes = await fsExtra
    .readFile(typeOutputFilepath, 'utf8')
    .catch(() => '');

  const iconNames = files.map((file) => iconName(file));

  const spriteUpToDate = iconNames.every((name) =>
    currentSprite.includes(`id=${name}`)
  );
  const typesUpToDate = iconNames.every((name) =>
    currentTypes.includes(`"${name}"`)
  );

  if (spriteUpToDate && typesUpToDate) {
    console.log(`Icons are up to date`);
    return;
  }

  let output = await generateSvgSprite({
    files,
    inputDir,
  });

  if (shouldOptimize) {
    const config = (await loadConfig()) || undefined;
    output = optimize(output, config).data;
  }

  let hash;
  if (shouldHash) {
    hash = crypto.createHash('md5').update(output).digest('hex');
  }

  const spriteChanged = await writeIfChanged({
    filepath: spriteFilepath,
    newContent: output,
    hash,
    force,
  });

  if (spriteChanged) {
    console.log(`Generating sprite for ${inputDir}`);
    for (const file of files) {
      console.log('✅', file);
    }
    console.log(`File size: ${calculateFileSizeInKB(output)} KB`);

    if (shouldHash) {
      console.log(`Generated sprite with hash ${hash}`);
      console.log(
        `Saved to ${path.relative(
          process.cwd(),
          spriteFilepath.replace(/\.svg$/, `.${hash}.svg`)
        )}`
      );
    } else {
      console.log(`Saved to ${path.relative(process.cwd(), spriteFilepath)}`);
    }
  }

  /** Types export */
  const stringifiedIconNames = iconNames.map((name) => JSON.stringify(name));
  const typeOutputContent = `export type IconName =
    \t| ${stringifiedIconNames.join('\n\t| ').replace(/"/g, "'")};
    `;
  const typesChanged = await writeIfChanged({
    filepath: typeOutputFilepath,
    newContent: typeOutputContent,
    force,
  });

  if (typesChanged) {
    console.log(
      `Types saved to ${path.relative(process.cwd(), typeOutputFilepath)}`
    );
  }

  /** Export icon names */
  const iconsOutputFilepath = path.join(outputDir, 'icons.ts');
  const iconsOutputContent = `import { IconName } from './types/icon-name';
  
  export const icons = [
  \t${stringifiedIconNames.join(',\n\t')},
  ] satisfies Array<IconName>;
  `;
  const iconsChanged = await writeIfChanged({
    filepath: iconsOutputFilepath,
    newContent: iconsOutputContent,
    force,
  });

  if (iconsChanged) {
    console.log(
      `Icons names saved to ${path.relative(
        process.cwd(),
        iconsOutputFilepath
      )}`
    );
  }

  /** Hash file export */
  if (shouldHash) {
    const hashOutputFilepath = path.join(outputDir, 'hash.ts');
    const hashFileContent = `export const hash = '${hash}';\n`;
    const hashFileChanged = await writeIfChanged({
      filepath: hashOutputFilepath,
      newContent: hashFileContent,
      force,
    });

    if (hashFileChanged) {
      console.log(
        `Hash file saved to ${path.relative(process.cwd(), hashOutputFilepath)}`
      );
    }
  }

  /** Log */
  if (spriteChanged || typesChanged || iconsChanged) {
    console.log(`Generated ${files.length} icons`);
  } else {
    console.log(`Icons are up to date`);
  }
}
