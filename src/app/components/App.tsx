import * as React from 'react';
import '../styles/index.scss';

const App = () => {
  const [selectionColors, setSelectionColors] = React.useState([]);
  const [brandColors, setBrandColors] = React.useState([]);
  const [selectedGroups, setSelectedGroups] = React.useState({});
  const [selectedBrandColor, setSelectedBrandColor] = React.useState(null);

  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    window.onmessage = event => {
      const { type, data } = event.data.pluginMessage;
      if (type === 'selection-colors') setSelectionColors(data);
      if (type === 'brand-colors') setBrandColors(data);
    };
    parent.postMessage({ pluginMessage: { type: 'init' } }, '*');
  }, []);

  const handleSearch = () => {
    const input = inputRef.current?.value?.trim();
    if (!input) return;

    parent.postMessage({
      pluginMessage: {
        type: 'search-colors',
        data: { queryHex: input },
      },
    }, '*');
  };

  const handleReplace = () => {
    Object.entries(selectedGroups).forEach(([groupHex, checked]) => {
      if (checked && selectedBrandColor) {
        parent.postMessage({
          pluginMessage: {
            type: 'replace-group',
            data: { groupHex, variableId: selectedBrandColor },
          },
        }, '*');
      }
    });
  };

  return (
    <div className="page">
      <div className="row">
        <input ref={inputRef} className="input__field" placeholder="Search for color" />
        <button className="button button--secondary" onClick={handleSearch}>Search</button>
      </div>

      <div className="main-content">
        <div className="col bordered">
          <h4>Selection Colors</h4>
          {selectionColors.map(group => (
            <label key={group.hex} className="color-row">
              <input
                type="checkbox"
                checked={!!selectedGroups[group.hex]}
                onChange={() => setSelectedGroups(prev => ({
                  ...prev,
                  [group.hex]: !prev[group.hex]
                }))}
              />
              <div className="swatch" style={{ backgroundColor: group.hex }} />
              {group.hex} ({group.nodes.length})
            </label>
          ))}
        </div>

        <div className="col bordered">
          <h4>Brand Library Colors</h4>
          <div className="row">
            {brandColors.map(color => (
              <div
                key={color.id}
                className={`swatch-style ${selectedBrandColor === color.id ? 'selected' : ''}`}
                style={{ backgroundColor: color.hex }}
                onClick={() => setSelectedBrandColor(color.id)}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="footer">
        <div>Select brand color and group to replace</div>
        <button className="button button--primary" onClick={handleReplace}>Replace</button>
      </div>
    </div>
  );
};

export default App;
