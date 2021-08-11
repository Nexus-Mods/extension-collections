import { initFromProfile } from '../../collectionCreate';
import { MOD_TYPE, NEXUS_BASE_URL } from '../../constants';
import { makeCollectionId } from '../../util/transformCollection';

import CollectionThumbnail from './CollectionThumbnail';

import i18next from 'i18next';
import * as React from 'react';
import { Panel, Tab, Tabs } from 'react-bootstrap';
import { ComponentEx, EmptyPlaceholder, Icon, IconBar, PortalMenu, types, util } from 'vortex-api';

export interface IStartPageProps {
  t: i18next.TFunction;
  game: types.IGameStored;
  installing: types.IMod;
  profile: types.IProfile;
  activeTab: string;
  mods: { [modId: string]: types.IMod };
  matchedReferences: { [collectionId: string]: types.IMod[] };
  onCreateCollection: (name: string) => void;
  onEdit: (modId: string) => void;
  onUpload: (modId: string) => void;
  onView: (modId: string) => void;
  onRemove: (modId: string) => void;
  onResume: (modId: string) => void;
  onPause: (modId: string) => void;
  onSetActiveTab: (tabId: string) => void;
}

interface IComponentState {
  createOpen: boolean;
  mousePosition: { x: number, y: number };
  imageTime: number;
}

const nop = () => null;

// allow any unicode character that is considered a letter or a number and the
// special characters space and minus
const validRE = /^[\p{L}\p{N} -]*$/u;

function validateCollectionName(t: i18next.TFunction, input: string): string {
  if (input.length < 3) {
    return t('The name bust be between 3-36 characters long');
  }

  if (input.match(validRE) === null) {
    return t('Invalid characters, only letters, numbers, space and - are allowed.');
  }

  return undefined;
}

interface IAddCardProps {
  t: types.TFunction;
  onClick: () => void;
}

function AddCard(props: IAddCardProps) {
  const { t, onClick } = props;

  const classes = ['collection-add-btn'];

  return (
    <Panel className={classes.join(' ')} bsStyle='default' onClick={onClick}>
      <Panel.Body className='collection-thumbnail-body'>
        <EmptyPlaceholder
          icon='folder-add'
          text={t('Discover more collections')}
        />
      </Panel.Body>
    </Panel>
  );
}

interface ICreateCardProps {
  t: types.TFunction;
  onCreateFromProfile: () => void;
  onCreateEmpty: () => void;
}

function CreateCard(props: ICreateCardProps) {
  const { t } = props;

  const classes = ['collection-add-btn'];

  const actions: types.IActionDefinition[] = [
    {
      title: 'From Profile',
      icon: 'profile',
      action: (instanceIds: string[]) => {
        props.onCreateFromProfile();
      },
    }, {
      title: 'Empty',
      icon: 'show',
      action: (instanceIds: string[]) => {
        props.onCreateEmpty();
      },
    },
  ];

  return (
    <Panel className={classes.join(' ')} bsStyle='default'>
      <Panel.Body className='collection-thumbnail-body'>
        <EmptyPlaceholder
          icon='add'
          text={t('Create a collection')}
          fill
        />
        <div className='hover-menu'>
          <div key='primary-buttons' className='hover-content'>
            <IconBar
              className='buttons'
              group={`collection-actions`}
              staticElements={actions}
              collapse={false}
              buttonType='text'
              orientation='vertical'
              clickAnywhere={true}
              t={t}
            />
          </div>
        </div>
      </Panel.Body>
    </Panel>
  );
}

class StartPage extends ComponentEx<IStartPageProps, IComponentState> {
  constructor(props: IStartPageProps) {
    super(props);
    this.initState({
      createOpen: false,
      imageTime: Date.now(),
      mousePosition: { x: 0, y: 0 },
    });
  }

  public render(): JSX.Element {
    const { t, activeTab, installing, profile, matchedReferences, mods, onEdit, onPause, onUpload,
            onRemove, onResume, onView } = this.props;
    const { imageTime } = this.state;

    const collections = Object.values(mods).filter(mod => mod.type === MOD_TYPE);
    const {foreign, own} = collections.reduce((prev, mod) => {
      if (util.getSafe(mod.attributes, ['editable'], false)) {
        prev.own.push(mod);
      } else {
        prev.foreign.push(mod);
      }
      return prev;
    }, { foreign: [], own: [] });

    const id = makeCollectionId(profile.id);

    return (
      <Tabs id='collection-start-page' activeKey={activeTab} onSelect={this.setActiveTab}>
        <Tab
          tabClassName='collection-tab'
          eventKey='active-collections'
          title={<><Icon name='add'/>{t('Added Collections')}</>}
        >
          <Panel>
            <Panel.Heading>
              <Panel.Title>{t('View and manage collections created by other users.')}</Panel.Title>
            </Panel.Heading>
            <Panel.Body>
              <div className='collection-list'>
                <AddCard t={t} onClick={this.openCollections} />
                {foreign.map(mod =>
                  <CollectionThumbnail
                    key={mod.id}
                    t={t}
                    gameId={profile.gameId}
                    imageTime={imageTime}
                    installing={installing}
                    mods={mods}
                    incomplete={matchedReferences[mod.id]?.includes?.(null)}
                    collection={mod}
                    onView={onView}
                    onRemove={onRemove}
                    onResume={onResume}
                    onPause={onPause}
                    details={true}
                  />)}
              </div>
            </Panel.Body>
          </Panel>
        </Tab>
        <Tab
          tabClassName='collection-tab'
          eventKey='collection-workshop'
          title={<><Icon name='highlight-tool' />{t('Workshop')}</>}
        >
          <Panel>
            <Panel.Heading>
              <Panel.Title>
                {t('Build your own collections and share them with the Nexus Mods community.')}
              </Panel.Title>
            </Panel.Heading>
            <Panel.Body>
              <div className='collection-list'>
                <CreateCard
                  t={t}
                  onCreateFromProfile={this.fromProfile}
                  onCreateEmpty={this.fromEmpty}
                />
                {own.map(mod =>
                  <CollectionThumbnail
                    key={mod.id}
                    t={t}
                    gameId={profile.gameId}
                    collection={mod}
                    imageTime={imageTime}
                    mods={mods}
                    incomplete={matchedReferences[mod.id]?.includes?.(null)}
                    onEdit={onEdit}
                    onRemove={onRemove}
                    onUpload={onUpload}
                    details={true}
                  />)}
              </div>
            </Panel.Body>
          </Panel>
        </Tab>
      </Tabs>
    );
  }

  private setActiveTab = (tabId: any) => {
    this.props.onSetActiveTab(tabId);
  }

  private openCollections = async () => {
    const { game } = this.props;

    util.opn(`${NEXUS_BASE_URL}/${(util as any).nexusGameId(game)}/collections`);
  }

  private fromProfile = () => {
    const { profile } = this.props;
    initFromProfile(this.context.api, profile.id)
      .then(() => this.refreshImages())
      .catch(err => this.context.api.showErrorNotification('Failed to init collection', err));
  }

  private fromEmpty = () => {
    const { t, onCreateCollection } = this.props;
    this.context.api.showDialog('question', 'Name', {
      text: 'Please enter a name for your new collection.',
      input: [{ id: 'name', label: 'Collection Name', type: 'text' }],
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

  private refreshImages() {
    this.nextState.imageTime = Date.now();
  }
}

export default StartPage as React.ComponentClass<IStartPageProps>;
