import * as Promise from 'bluebird';
import I18next from 'i18next';
import * as path from 'path';
import * as React from 'react';
import { Image as BSImage, Panel } from 'react-bootstrap';
import { connect } from 'react-redux';
import { Icon, IconBar, Image, PureComponentEx, selectors, types, util } from 'vortex-api';
import { AUTHOR_UNKNOWN } from '../../constants';
import CollectionReleaseStatus from './CollectionReleaseStatus';

export interface IBaseProps {
  t: I18next.TFunction;
  gameId: string;
  collection: types.IMod;
  mods?: { [modId: string]: types.IMod };
  incomplete?: boolean;
  details: boolean;
  imageTime: number;
  onResume?: (modId: string) => void;
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
  public render(): JSX.Element {
    const { t, collection, details, imageTime,
            incomplete, mods, profile, stagingPath } = this.props;

    if (collection === undefined) {
      return null;
    }

    const logoPath = path.join(stagingPath, collection.installationPath, 'logo.jpg');
    const active = util.getSafe(profile, ['modState', collection.id, 'enabled'], false);

    const refMods = (collection.rules ?? [])
      .filter(rule => ['requires', 'recommends'].includes(rule.type));

    const totalSize = Object.values(collection.rules ?? []).reduce((prev, rule) => {
      if (rule.reference.fileSize !== undefined) {
        return prev + rule.reference.fileSize;
      } else if ((rule.reference.id !== undefined) && (mods !== undefined)) {
        return prev + mods[rule.reference.id]?.attributes?.fileSize ?? 0;
      } else {
        return prev;
      }
    }, 0);

    return (
      <Panel className='collection-thumbnail' bsStyle={active ? 'primary' : 'default'}>
        <Panel.Body className='collection-thumbnail-body'>
          <Image
            className={'thumbnail-img'}
            srcs={[logoPath + `?_r=${imageTime}`, path.join(__dirname, 'fallback_tile.png')]}
            circle={false}
          />
          <div className='gradient' />
          <div className='author'>
            <BSImage
              src='assets/images/noavatar.png'
              circle
            />
            {collection.attributes.author ?? `${t(AUTHOR_UNKNOWN)}`}
          </div>
          {details ? (
            <CollectionReleaseStatus
              t={t}
              active={active}
              collection={collection}
              incomplete={incomplete}
            />
          ) : null}
          {details ? (
            <div className='bottom'>
              <div className='name'>
                {util.renderModName(collection, { version: false })}
              </div>
               <div className='details'>
                <div><Icon name='mods' />{refMods.length}</div>
                <div><Icon name='archive' />{util.bytesToString(totalSize)}</div>
                <div className='revision-number'>
                  {t('Revision {{number}}', { replace: {
                    number: collection.attributes.version ?? '0',
                  } })}
                </div>
              </div>
            </div>
          ) : null}
          {(this.actions.length > 0) ? (
            <div className='hover-menu'>
              {this.renderMenu()}
            </div>
          ) : null}
        </Panel.Body>
      </Panel>
    );
  }

  private get actions() {
    const { collection, incomplete, onEdit, onPublish, onRemove, onResume, onView } = this.props;

    const result = [];

    if (onView) {
      result.push({
        title: incomplete ? 'Resume' : 'View',
        icon: 'show',
        action: (instanceIds: string[]) => {
          if (incomplete && (onResume !== undefined)) {
            onResume(instanceIds[0]);
          }
          onView(instanceIds[0]);
        },
      });
    }
    if (onEdit) {
      result.push({
        title: 'Edit',
        icon: 'edit',
        action: (instanceIds: string[]) => onEdit(instanceIds[0]),
      });
    }
    if (onRemove) {
      result.push({
        title: 'Remove',
        icon: 'remove',
        action: (instanceIds: string[]) => onRemove(instanceIds[0]),
      });
    }

    if (onPublish) {
      result.push({
        title: collection.attributes?.collectionId !== undefined ? 'Update' : 'Publish',
        icon: 'clone',
        action: (instanceIds: string[]) => onPublish(instanceIds[0]),
      });
    }

    return result;
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
          staticElements={this.actions}
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
    CollectionThumbnail) as React.ComponentType<IBaseProps>;
