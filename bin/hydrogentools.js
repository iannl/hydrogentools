#!/usr/bin/env node

/*
   Copyright 2026 iannl

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/

import fs from 'fs';
import { program } from 'commander';

function parse(text) {
    const lines = text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
    const trees = [];
    const treeHeader = /^Tree=(\d+)/;
    let i = 0;
    while (i < lines.length) {
        const headerMatch = lines[i].match(treeHeader);
        if (!headerMatch) {
            i++;
            continue;
        }
        const treeIdx = Number(headerMatch[1]);
        const tree = { idx: treeIdx, nodes: [] };
        i++;
        const arrays = {};
        while (i < lines.length && !lines[i].startsWith('Tree=')) {
            const line = lines[i];
            const eqPos = line.indexOf('=');
            if (eqPos > -1) {
                const key = line.slice(0, eqPos);
                const val = line.slice(eqPos + 1);
                arrays[key] = val;
            }
            i++;
        }
        const toNumArray = (s) =>
            (s ?? '')
                .split(' ')
                .filter((v) => v !== '')
                .map(Number);
        const splitFeatures = toNumArray(arrays['split_feature']);
        const thresholds = toNumArray(arrays['threshold']);
        const leftChildren = toNumArray(arrays['left_child']);
        const rightChildren = toNumArray(arrays['right_child']);
        const leafVals = toNumArray(arrays['leaf_value']);
        const internalCount = splitFeatures.length;
        const leafCount = leafVals.length;
        for (let n = 0; n < internalCount; n++) {
            tree.nodes.push({
                type: 'internal',
                featureIdx: splitFeatures[n],
                threshold: thresholds[n],
                left: leftChildren[n],
                right: rightChildren[n],
            });
        }
        for (let n = 0; n < leafCount; n++) {
            tree.nodes.push({ type: 'leaf', value: leafVals[n] });
        }
        trees.push(tree);
    }
    return trees;
}

program
    .option('-i, --input <path>', 'model text dump', 'model.txt')
    .option('-o, --output <path>', 'binary output', 'model.bin')
    .parse();

const inPath = program.opts().input;
const outPath = program.opts().output;

let text;
try {
    text = fs.readFileSync(inPath, 'utf8');
} catch (e) {
    console.error(`Cannot read "${inPath}" (maybe try hydrogentools --help)`);
    process.exit(1);
}

const trees = parse(text);

let totalBytes = 4;
for (const t of trees) {
    const internalCount = t.nodes.findIndex((n) => n.type === 'leaf');
    const leafCount = t.nodes.length - internalCount;
    totalBytes += 4 + 4;
    totalBytes += internalCount * (4 + 8 + 4 + 4);
    totalBytes += leafCount * 8;
}

const buf = Buffer.allocUnsafe(totalBytes);
let offset = 0;
buf.writeUInt32LE(trees.length, offset);
offset += 4;

for (const tree of trees) {
    const internalCount = tree.nodes.findIndex((n) => n.type === 'leaf');
    const leafCount = tree.nodes.length - internalCount;
    buf.writeUInt32LE(internalCount, offset);
    offset += 4;
    buf.writeUInt32LE(leafCount, offset);
    offset += 4;

    for (let n = 0; n < internalCount; n++) {
        const nd = tree.nodes[n];
        buf.writeUInt32LE(nd.featureIdx >>> 0, offset);
        offset += 4;
        buf.writeDoubleLE(Number(nd.threshold), offset);
        offset += 8;
        buf.writeInt32LE(Number(nd.left), offset);
        offset += 4;
        buf.writeInt32LE(Number(nd.right), offset);
        offset += 4;
    }

    for (let i = 0; i < leafCount; i++) {
        const leaf = tree.nodes[internalCount + i];
        buf.writeDoubleLE(Number(leaf.value), offset);
        offset += 8;
    }
}

fs.writeFileSync(outPath, buf);
console.log(`Wrote ${outPath} (${totalBytes} bytes)`);
