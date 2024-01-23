import * as React from 'react';
import { ControlLabel, ListGroup, Popover, Table } from 'react-bootstrap';
import { Overlay, Toggle, types, util } from 'vortex-api';

export interface IFileOverridesProps {
  t: types.TFunction;
  collection: types.IMod;
  mods: { [modId: string]: types.IMod };
  onSetCollectionAttribute: (path: string[], value: any) => void;
}

function FileOverrides(props: IFileOverridesProps) {
  const { t, collection, mods, onSetCollectionAttribute } = props;

  const [showOverlay, setShowOverlay] = React.useState(undefined);

  const target = React.useRef<HTMLElement>();
  const container = React.useRef<HTMLDivElement>();

  const modsWithOverrides = React.useMemo(() =>
    (collection.rules ?? [])
      .filter(rule => ['requires', 'recommends'].includes(rule.type))
      .map(rule => util.findModByRef(rule.reference, mods))
      .filter(mod => (mod?.fileOverrides ?? []).length > 0)
  , [collection, mods]);

  const toggleOverride = React.useCallback((value: boolean, dataId: string) => {
    onSetCollectionAttribute(['fileOverrides', dataId], value)
  }, []);

  const togglePopover = React.useCallback((evt: React.MouseEvent<HTMLElement>) => {
    const modId = evt.currentTarget.getAttribute('data-modid');
    if (showOverlay === modId) {
      setShowOverlay(undefined);
    } else {
      target.current = evt.currentTarget;
      setShowOverlay(modId);
    }
  }, [setShowOverlay, showOverlay]);

  const hide = React.useCallback((evt) => {
    evt.preventDefault();
    setShowOverlay(undefined);
  }, []);

  const getBounds = React.useCallback((): DOMRect => {
    return container.current !== undefined ? container.current.getBoundingClientRect() : {
      left: 0,
      top: 0,
      width: window.innerWidth,
      height: window.innerHeight,
      right: window.innerWidth,
      bottom: window.innerHeight,
    } as any;
  }, [container.current]);

  const mod = mods[showOverlay];
  const popover = showOverlay === undefined ? <Popover/> : (
    <Popover id='file-overrides-popover'>
      <ListGroup>
        {(mod.fileOverrides ?? []).map(override => (
          <div key={override}>{override}</div>
        ))}
      </ListGroup>
    </Popover>
  );

  const isEnabled = (id: string) => collection.attributes?.collection?.fileOverrides?.[id] ?? false;

  return (
    <div ref={container} id='collection-file-overrides' className='collection-file-overrides'>
      <ControlLabel>
        <p>
          {t('File overrides let you override file priority on a file-by-file basis. '
            + 'The collection will include the file overrides you have defined for any mod enabled below.')}
        </p>
        <p>
          {t('The overridden files will be taken from these mod ignoring any other mod rules the '
            + 'user may have. You should assume many users may not be aware of this functionality and thus '
            + 'how to change this if it\'s not what they want so please use this sparingly.')}
        </p>
      </ControlLabel>
      <Table>
        <tbody>
          {modsWithOverrides.map(mod => (
            <tr key={mod.id}>
              <td>
                <Toggle
                  checked={isEnabled(mod.id)}
                  dataId={mod.id}
                  onToggle={toggleOverride}
                >
                  {util.renderModName(mod)}
                  &nbsp;
                  <Overlay
                    rootClose
                    show={showOverlay !== undefined}
                    onHide={hide}
                    orientation='horizontal'
                    getBounds={getBounds}
                    target={target.current}
                  >
                    {popover}
                  </Overlay>
                </Toggle>
              </td>
              <td>
                <a data-modid={mod.id} onClick={togglePopover}>
                  {t('contains {{count}} file override', {
                    count: (mod.fileOverrides ?? []).length,
                  })}
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

export default FileOverrides;
