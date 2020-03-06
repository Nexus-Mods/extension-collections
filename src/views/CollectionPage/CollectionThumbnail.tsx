import * as Promise from 'bluebird';
import I18next from 'i18next';
import * as path from 'path';
import * as React from 'react';
import { Image, Panel } from 'react-bootstrap';
import { connect } from 'react-redux';
import { IconBar, PureComponentEx, selectors, types, util, Icon } from 'vortex-api';
import { AUTHOR_UNKNOWN } from '../../constants';

export interface IBaseProps {
  t: I18next.TFunction;
  gameId: string;
  collection: types.IMod;
  incomplete?: boolean;
  details: boolean;
  imageTime: number;
  onEdit?: (modId: string) => void;
  onView?: (modId: string) => void;
  onRemove?: (modId: string) => void;
  onPublish?: (modId: string) => void;
}

interface IConnectedProps {
  stagingPath: string;
  profile: types.IProfile;
}

type IProps = IBaseProps & IConnectedProps;

class CollectionThumbnail extends PureComponentEx<IProps, {}> {
  private mActions: types.IActionDefinition[] = [];

  constructor(props: IProps) {
    super(props);

    this.initState({ incomplete: false });
  }

  public componentWillMount() {
    const { collection, incomplete, onEdit, onPublish, onRemove, onView, profile } = this.props;

    if (onView) {
      this.mActions.push({
        title: incomplete ? 'Resume' : 'View',
        icon: 'show',
        action: (instanceIds: string[]) => {
          if (incomplete) {
            this.context.api.events.emit('install-dependencies', profile.id, [collection.id], true)
          }
          onView(instanceIds[0]);
        },
      });
    }
    if (onEdit) {
      this.mActions.push({
        title: 'Edit',
        icon: 'edit',
        action: (instanceIds: string[]) => onEdit(instanceIds[0]),
      });
    }
    if (onRemove) {
      this.mActions.push({
        title: 'Remove',
        icon: 'remove',
        action: (instanceIds: string[]) => onRemove(instanceIds[0]),
      });
    }

    if (onPublish) {
      this.mActions.push({
        title: 'Publish',
        icon: 'clone',
        action: (instanceIds: string[]) => onPublish(instanceIds[0]),
      });
    }
  }

  public render(): JSX.Element {
    const { t, collection, details, imageTime, profile, stagingPath } = this.props;

    const logoPath = path.join(stagingPath, collection.installationPath, 'logo.jpg');
    const active = util.getSafe(profile, ['modState', collection.id, 'enabled'], false);

    const mods = (collection.rules || [])
      .filter(rule => ['requires', 'recommends'].includes(rule.type));

    return (
      <Panel className='collection-thumbnail' bsStyle={active ? 'primary' : 'default'}>
        <Panel.Body className='collection-thumbnail-body'>
          <img
            className={'thumbnail-img'}
            src={logoPath + `?_r=${imageTime}`}
          />
          <div className='gradient' />
          {details ? (
            <div className='collection-status-container'>
              {this.renderCollectionStatus(active, mods)}
            </div>
          ) : null}
          {details ? (
            <div className='collection-version-container'>
              <div className='collection-version'>
                {util.getSafe(collection.attributes, ['version'], '0.0.0')}
              </div>
            </div>
          ) : null}
          {details ? (
            <div className='bottom'>
              <div className='name'>
                {util.renderModName(collection, { version: false })}
              </div>
              <div className='author'>
                <Image
                  src='assets/images/noavatar.png'
                  circle
                />
                {util.getSafe(collection.attributes, ['author'], undefined)
                  || `${t(AUTHOR_UNKNOWN)}`}
              </div>
              <div className='details'>
                <span><Icon name='mods' />{mods.length}</span>
                <span><Icon name='archive' />??? MB</span>
              </div>
            </div>
          ) : null}
          {(this.mActions.length > 0) ? (
            <div className='hover-menu'>
              {this.renderMenu()}
            </div>
          ) : null}
        </Panel.Body>
      </Panel>
    );
  }

  private renderCollectionStatus(active: boolean, mods: types.IModRule[]) {
    const { t, collection, incomplete } = this.props;
    if (active) {
      if (incomplete) {
        return <div className='collection-status'>{t('Incomplete')}</div>;
      } else if (util.getSafe(collection.attributes, ['collectionId'], undefined) !== undefined) {
        return <div className='collection-status'>{t('Published')}</div>;
      } else {
        return <div className='collection-status'>{t('Enabled')}</div>;
      }
    } else {
      return null;
    }
  }

  private renderMenu(): JSX.Element[] {
    const { t, collection: mod } = this.props;

    return [(
      <div key='primary-buttons' className='hover-content'>
        <IconBar
          id={`collection-thumbnail-${mod.id}`}
          className='buttons'
          group={`collection-actions`}
          instanceId={mod.id}
          staticElements={this.mActions}
          collapse={false}
          buttonType='text'
          orientation='vertical'
          clickAnywhere={true}
          t={t}
        />
      </div>
    )];
  }
}

const emptyObj = {};

function mapStateToProps(state: types.IState, ownProps: IBaseProps): IConnectedProps {
  return {
    stagingPath: selectors.installPathForGame(state, ownProps.gameId),
    profile: selectors.activeProfile(state),
  };
}

export default
  connect(mapStateToProps)(
    CollectionThumbnail) as React.ComponentClass<IBaseProps>;
