import * as React from 'react';
import { ComponentEx, FlexLayout, tooltip } from 'vortex-api';

interface IBaseProps {
  modId: string;
  collectionNames: string[];
}

type IProps = IBaseProps;

class Tooltip extends ComponentEx<{ collectionNames: string[] }, {}> {
  public render(): JSX.Element {
    const { collectionNames } = this.props;
    return (
      <ul className='collection-mods-page-attrib-tooltip'>
        {collectionNames.map(this.renderListEntry)}
      </ul>
    );
  }

  private renderListEntry = (name: string, idx: number) => {
    return (<li key={name + idx}>{name}</li>);
  }
}

class CollectionModsPageAttributeRenderer extends ComponentEx<IProps, {}> {
  public render(): JSX.Element {
    const { collectionNames } = this.props;
    const count = collectionNames.length;
    return (count > 0)
      ? (
        <FlexLayout type='row' id='collection-mods-page-attribute-renderer'>
          <FlexLayout.Fixed>
            <p>{collectionNames[0]}</p>
          </FlexLayout.Fixed>
          {(count > 1) && this.renderAddendum()}
        </FlexLayout>
    ) : null;
  }

  private noop = () => null;

  private renderAddendum = (): JSX.Element => {
    const { collectionNames, modId } = this.props;
    const filtered = collectionNames.slice(1);
    const tip = <Tooltip collectionNames={filtered} />;
    return (
      <tooltip.Button
        id={`${modId}-collection-count`}
        className='collection-mods-page-attr-addendum'
        tooltip={tip}
        onClick={this.noop}
      >
        {`+${filtered.length}`}
      </tooltip.Button>
    );
  }
}

export default CollectionModsPageAttributeRenderer as React.ComponentClass<IBaseProps>;
