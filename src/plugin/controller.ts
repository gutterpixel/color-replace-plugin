figma.showUI(__html__, { width: 520, height: 480 });

import chroma from 'chroma-js';

type RGB = { r: number; g: number; b: number };

interface GroupedColor {
  hex: string;
  nodes: SceneNode[];
}

let groupedSelectionColors: GroupedColor[] = [];
let brandVariables: { name: string; id: string; hex: string }[] = [];

function rgbToHex({ r, g, b }: RGB): string {
  return chroma.rgb(r * 255, g * 255, b * 255).hex();
}

function groupSimilarColors(colors: { node: SceneNode; hex: string }[], threshold = 20): GroupedColor[] {
  const groups: GroupedColor[] = [];

  for (const { node, hex } of colors) {
    const match = groups.find(g => chroma.distance(g.hex, hex, 'rgb') < threshold);
    if (match) {
      match.nodes.push(node);
    } else {
      groups.push({ hex, nodes: [node] });
    }
  }

  return groups;
}

function* walkTree(node: SceneNode): IterableIterator<SceneNode> {
  yield node;
  if ('children' in node) {
    for (const child of node.children) {
      yield* walkTree(child);
    }
  }
}

function collectSelectionColors(queryHex?: string) {
  const foundColors: { node: SceneNode; hex: string }[] = [];

  for (const node of figma.currentPage.selection) {
    for (const child of walkTree(node)) {
      if ('fills' in child && Array.isArray(child.fills)) {
        for (const fill of child.fills as readonly Paint[]) {
          if (fill.type === 'SOLID') {
            const hex = rgbToHex(fill.color);
            if (!queryHex || chroma.distance(hex, queryHex, 'rgb') < 20) {
              foundColors.push({ node: child, hex });
            }
          }
        }
      }
    }
  }

  groupedSelectionColors = groupSimilarColors(foundColors);
  figma.ui.postMessage({ type: 'selection-colors', data: groupedSelectionColors });
}

function loadBrandVariables() {
  const allVars = figma.variables.getLocalVariables();
  const remoteVars = allVars.filter(v => v.remote && v.resolvedType === 'COLOR');

  const collected: { name: string; id: string; hex: string }[] = [];

  for (const variable of remoteVars) {
    const modeIds = Object.keys(variable.valuesByMode ?? {});
    if (modeIds.length === 0) continue;
    const value = variable.valuesByMode[modeIds[0]];
    if (value && typeof value === 'object' && 'r' in value) {
      const hex = rgbToHex(value as RGB);
      collected.push({ name: variable.name, id: variable.id, hex });
    }
  }

  brandVariables = collected;
  figma.ui.postMessage({ type: 'brand-colors', data: brandVariables });
}

function applyVariableToGroup(groupHex: string, variableId: string) {
  const group = groupedSelectionColors.find(g => g.hex === groupHex);
  if (!group) return;

  for (const node of group.nodes) {
    if ('boundVariables' in node && typeof node.setBoundVariable === 'function') {
      const bindings = figma.variables.getApplicableVariableBindingKeys(node);
      if (bindings.includes('fill')) {
        try {
          node.setBoundVariable('fill', variableId);
        } catch (err) {
          console.warn(`Could not bind variable to node:`, node, err);
        }
      }
    }
  }

  figma.notify(`Replaced ${group.nodes.length} nodes with brand variable.`);
  collectSelectionColors();
}

figma.ui.onmessage = msg => {
  if (msg.type === 'init') {
    loadBrandVariables();
    collectSelectionColors();
  }

  if (msg.type === 'replace-group') {
    const { groupHex, variableId } = msg.data;
    applyVariableToGroup(groupHex, variableId);
  }

  if (msg.type === 'search-colors') {
    const { queryHex } = msg.data;
    collectSelectionColors(queryHex);
  }
};
