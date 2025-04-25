// Show the UI
figma.showUI(__html__, { width: 520, height: 480 });

import chroma from 'chroma-js';

interface RGB {
  r: number;
  g: number;
  b: number;
}

interface GroupedColor {
  hex: string;
  nodes: SceneNode[];
}

let groupedSelectionColors: GroupedColor[] = [];
let brandVariables: { name: string; id: string; hex: string }[] = [];

function rgbToHex({ r, g, b }: RGB): string {
  return chroma.rgb(r * 255, g * 255, b * 255).hex();
}

function groupSimilarColors(colors: { node: SceneNode; hex: string }[], threshold: number = 20): GroupedColor[] {
  const groups: GroupedColor[] = [];

  colors.forEach(({ node, hex }) => {
    const match = groups.find(group => chroma.distance(group.hex, hex, 'rgb') < threshold);
    if (match) {
      match.nodes.push(node);
    } else {
      groups.push({ hex, nodes: [node] });
    }
  });

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

function collectSelectionColors(queryHex?: string): void {
  const selection = figma.currentPage.selection;
  const foundColors: { node: SceneNode; hex: string }[] = [];

  for (const node of selection) {
    for (const child of walkTree(node)) {
      if ('fills' in child && Array.isArray(child.fills)) {
        const fills = child.fills as readonly Paint[];
        for (const fill of fills) {
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

async function loadBrandVariables(): Promise<void> {
  const brandSet: { name: string; id: string; hex: string }[] = [];

  const allVariables = figma.variables.getLocalVariables();
  for (const variable of allVariables) {
    if (variable.resolvedType === 'COLOR') {
      const modeIds = Object.keys(variable.valuesByMode);
      const value = variable.valuesByMode[modeIds[0]];
      if (value && typeof value === 'object' && 'r' in value) {
        const hex = rgbToHex(value as RGB);
        brandSet.push({ name: variable.name, id: variable.id, hex });
      }
    }
  }

  if (figma.teamLibrary) {
    const remoteCollections = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
    for (const collection of remoteCollections) {
      const vars = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(collection.key);
      for (const v of vars) {
        if (v.resolvedType === 'COLOR') {
          try {
            const imported = await figma.variables.importVariableByKeyAsync(v.key);
            const modeIds = Object.keys(imported.valuesByMode);
            const value = imported.valuesByMode[modeIds[0]];
            if (value && typeof value === 'object' && 'r' in value) {
              const hex = rgbToHex(value as RGB);
              brandSet.push({ name: imported.name, id: imported.id, hex });
            }
          } catch (err) {
            console.warn(`Could not import variable: ${v.name}`, err);
          }
        }
      }
    }
  }

  brandVariables = brandSet;
  figma.ui.postMessage({ type: 'brand-colors', data: brandVariables });
}

function applyVariableToGroup(groupHex: string, variableId: string): void {
  const group = groupedSelectionColors.find(g => g.hex === groupHex);
  if (!group) return;

  for (const node of group.nodes) {
    if ('boundVariables' in node && typeof node.setBoundVariable === 'function') {
      try {
        node.setBoundVariable('fill' as VariableBindableNodeField, variableId);
      } catch (e) {
        console.warn('Could not bind variable to node:', node, e);
      }
    }
  }

  figma.notify(`Replaced ${group.nodes.length} nodes with brand variable.`);
  collectSelectionColors();
}

figma.ui.onmessage = msg => {
  switch (msg.type) {
    case 'init':
      collectSelectionColors();
      loadBrandVariables();
      break;

    case 'replace-group': {
      const { groupHex, variableId } = msg.data;
      applyVariableToGroup(groupHex, variableId);
      break;
    }

    case 'search-colors': {
      const { queryHex } = msg.data;
      if (queryHex) collectSelectionColors(queryHex);
      break;
    }
  }
};