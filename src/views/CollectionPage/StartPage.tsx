import { MOD_TYPE } from '../../constants';
import { initFromProfile } from '../../modpackCreate';
import { makeModpackId } from '../../util/modpack';

import CollectionThumbnail from './CollectionThumbnail';

import i18next from 'i18next';
import * as React from 'react';
import { Dropdown, MenuItem, Panel, PanelGroup } from 'react-bootstrap';
import { ComponentEx, EmptyPlaceholder, Icon, types, util } from 'vortex-api';

export interface IStartPageProps {
  t: i18next.TFunction;
  profile: types.IProfile;
  mods: { [modId: string]: types.IMod };
  matchedReferences: { [collectionId: string]: types.IMod[] };
  onCreateCollection: (name: string) => void;
  onEdit: (modId: string) => void;
  onPublish: (modId: string) => void;
  onView: (modId: string) => void;
  onRemove: (modId: string) => void;
}

interface IComponentState {
  createOpen: boolean;
  imageTime: number;
}

const nop = () => null;

// allow any unicode character that is considered a letter or a number and the
// special characters space and minus
const validRE = /^[\p{L}\p{N} -]*$/u;

function validateCollectionName(t: i18next.TFunction, input: string): string {
  if (input.length < 3) {
    return t('Too short');
  }

  if (input.match(validRE) === null) {
    return t('Invalid characters, only letters, numbers, space and - are allowed.');
  }

  return undefined;
}

class StartPage extends ComponentEx<IStartPageProps, IComponentState> {
  constructor(props: IStartPageProps) {
    super(props);
    this.initState({
      createOpen: false,
      imageTime: Date.now(),
    });
  }

  public render(): JSX.Element {
    const { t, profile, matchedReferences, mods, onEdit, onPublish, onRemove, onView } = this.props;
    const { createOpen, imageTime } = this.state;

    const collections = Object.values(mods).filter(mod => mod.type === MOD_TYPE);
    const {foreign, own} = collections.reduce((prev, mod) => {
      if (util.getSafe(mod.attributes, ['editable'], false)) {
        prev.own.push(mod);
      } else {
        prev.foreign.push(mod);
      }
      return prev;
    }, { foreign: [], own: [] });

    const id = makeModpackId(profile.id);
    const profilePack: types.IMod = mods[id];

    return (
      <PanelGroup id='collection-panel-group'>
        <Panel expanded={true} eventKey='foreign' onToggle={nop}>
          <Panel.Heading>
            <Icon name={true ? 'showhide-down' : 'showhide-right'} />
            <Panel.Title>{t('Collections')}</Panel.Title>
          </Panel.Heading>
          <Panel.Body collapsible>
            <div className='collection-list'>
              {(foreign.length > 0)
                ? foreign.map(mod =>
                  <CollectionThumbnail
                    key={mod.id}
                    t={t}
                    gameId={profile.gameId}
                    imageTime={imageTime}
                    incomplete={matchedReferences[mod.id].includes(undefined)}
                    collection={mod}
                    onView={onView}
                    onRemove={onRemove}
                    details={true}
                  />)
                : (
                  <EmptyPlaceholder
                    icon='layout-list'
                    text={t('You have not installed any Collections yet')}
                    subtext={<a onClick={this.openCollections}>{t('Come get some')}</a>}
                  />
                )
              }
            </div>
          </Panel.Body>
        </Panel>
        <Panel expanded={true} eventKey='custom' onToggle={nop}>
          <Panel.Heading>
            <Icon name={true ? 'showhide-down' : 'showhide-right'} />
            <Panel.Title>{t('My Collections')}</Panel.Title>
          </Panel.Heading>
          <Panel.Body collapsible>
            <div className='collection-list'>
              {own.map(mod =>
                <CollectionThumbnail
                  key={mod.id}
                  t={t}
                  gameId={profile.gameId}
                  collection={mod}
                  imageTime={imageTime}
                  incomplete={matchedReferences[mod.id].includes(undefined)}
                  onEdit={onEdit}
                  onView={onView}
                  onRemove={onRemove}
                  onPublish={onPublish}
                  details={true}
                />)}
              <Panel className='collection-create-btn'>
                <Panel.Body onClick={this.toggleCreate}>
                  <Icon name='add' />
                  <div className='collection-create-label'>{t('Create Collection')}</div>
                  <Dropdown
                    id='create-collection-dropdown'
                    open={createOpen}
                    onToggle={this.toggleCreate}
                    onSelect={this.select as any}
                  >
                    {/* oh you say we need this react-bootstrap? here you go...  */}
                    <Dropdown.Toggle bsRole='toggle' style={{ display: 'none' }} />
                    <Dropdown.Menu>
                      <MenuItem
                        eventKey='profile'
                        disabled={profilePack !== undefined}
                        title={(profilePack !== undefined)
                          ? t('You already have a collection connected to this profile')
                          : t('Foobar')}
                      >
                        {t('From current profile ({{profileName}})', {
                          replace: {
                            profileName: profile.name,
                          },
                        })}
                      </MenuItem>
                      <MenuItem eventKey='empty'>{t('Empty (for game {{gameName}})', { replace: {
                        gameName: profile.gameId,
                      }})}</MenuItem>
                    </Dropdown.Menu>
                  </Dropdown>
                </Panel.Body>
              </Panel>
            </div>
          </Panel.Body>
        </Panel>
      </PanelGroup>
    );
  }

  private openCollections = () => {
    // TODO: this should open the collections website on nexusmods
    this.context.api.selectFile({ title: 'Select collection file' })
      .then(filePath => {
        if (filePath !== undefined) {
          this.context.api.events.emit('start-install', filePath);
        }
      });
  }

  private refreshImages() {
    this.nextState.imageTime = Date.now();
  }

  private select = (eventKey: string) => {
    const { t, profile, onCreateCollection } = this.props;

    if (eventKey === 'profile') {
      initFromProfile(this.context.api, profile.id)
        .then(() => this.refreshImages())
        .catch(err => this.context.api.showErrorNotification('Failed to init collection', err));
    } else {
      this.context.api.showDialog('question', 'Name', {
        text: 'Please enter a name for your new collection',
        input: [{ id: 'name', label: 'Name', type: 'text' }],
        condition: (content: types.IDialogContent): types.ConditionResults => {
          const validation = validateCollectionName(t, content.input[0].value || '');
          if (validation !== undefined) {
            return [{ actions: ['Create'], errorText: validation, id: 'name' }];
          } else {
            return [];
          }
        },
      }, [
        { label: 'Cancel' },
        { label: 'Create', default: true },
      ])
      .then((result: types.IDialogResult) => {
        if (result.action === 'Create') {
          onCreateCollection(result.input['name']);
        }
      });
    }
  }

  private toggleCreate = () => {
    this.nextState.createOpen = !this.state.createOpen;
  }
}

export default StartPage as React.ComponentClass<IStartPageProps>;
