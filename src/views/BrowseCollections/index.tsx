import { ICollection } from '@nexusmods/nexus-api';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import { MainPage, selectors, types, util } from 'vortex-api';

interface IBrowseCollectionsProps {
  api: types.IExtensionApi;
}

type SortField = 'createdAt' | 'endorsements' | 'recentRating' | 'downloads';
type SortDirection = 'ASC' | 'DESC';

interface ISortOption {
  field: SortField;
  direction: SortDirection;
  label: string;
}

const SORT_OPTIONS: ISortOption[] = [
  { field: 'createdAt', direction: 'DESC', label: 'Recently Listed' },
  { field: 'endorsements', direction: 'DESC', label: 'Most Endorsed' },
  { field: 'recentRating', direction: 'DESC', label: 'Highest Rated' },
  { field: 'downloads', direction: 'DESC', label: 'Most Downloaded' },
];

function BrowseCollections(props: IBrowseCollectionsProps) {
  const { api } = props;
  const { t } = useTranslation(['collections', 'common']);
  const gameId = useSelector((state: types.IState) => selectors.activeGameId(state));

  const [collections, setCollections] = React.useState<ICollection[]>([]);
  const [totalCount, setTotalCount] = React.useState<number>(0);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<Error | null>(null);
  const [sortBy, setSortBy] = React.useState<ISortOption>(SORT_OPTIONS[1]); // Default to "Most Endorsed"
  const [searchQuery, setSearchQuery] = React.useState<string>('');
  const [activeSearch, setActiveSearch] = React.useState<string>(''); // The search term actually being used

  const handleSearch = () => {
    setActiveSearch(searchQuery);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleAddCollection = (collection: ICollection) => {
    const revisionNumber = (collection as any).latestPublishedRevision?.revisionNumber || 'latest';
    // Use the game domain name from the collection data (already converted)
    const nxmUrl = `nxm://${collection.game.domainName}/collections/${collection.slug}/revisions/${revisionNumber}`;

    // Use the Vortex API to handle the NXM link
    api.events.emit('start-download', [nxmUrl], {}, undefined,
      (err: Error) => {
        if (err && !(err instanceof (api.ext as any).UserCanceled)) {
          api.showErrorNotification('Failed to add collection', err);
        }
      }, undefined, { allowInstall: 'force' });
  };

  const handleViewOnNexus = (collection: ICollection) => {
    const nexusUrl = `https://www.nexusmods.com/games/${collection.game.domainName}/collections/${collection.slug}`;
    util.opn(nexusUrl).catch(() => undefined);
  };

  React.useEffect(() => {
    if (!gameId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // Fetch collections using the new search API with sorting and search
    Promise.resolve(api.ext.nexusSearchCollections({
      gameId,
      count: 20,
      offset: 0,
      sort: {
        field: sortBy.field,
        direction: sortBy.direction,
      },
      search: activeSearch || undefined,
    }))
      .then((result: { nodes: ICollection[]; totalCount: number }) => {
        setCollections(result.nodes || []);
        setTotalCount(result.totalCount || 0);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err);
        setLoading(false);
      });
  }, [gameId, sortBy, activeSearch, api]);

  const formatFileSize = (bytes: string): string => {
    const size = parseInt(bytes, 10);
    if (isNaN(size)) return '0 MB';
    const mb = size / (1024 * 1024);
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(2)} GB`;
    }
    return `${mb.toFixed(2)} MB`;
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  };

  if (!gameId) {
    return (
      <MainPage id='browse-collections-page'>
        <MainPage.Body>
          <div style={{ padding: '20px', textAlign: 'center' }}>
            <p>{t('Please select a game to browse collections.')}</p>
          </div>
        </MainPage.Body>
      </MainPage>
    );
  }

  if (loading) {
    return (
      <MainPage id='browse-collections-page'>
        <MainPage.Body>
          <div style={{ padding: '20px', textAlign: 'center' }}>
            <p>{t('Loading collections...')}</p>
          </div>
        </MainPage.Body>
      </MainPage>
    );
  }

  if (error) {
    return (
      <MainPage id='browse-collections-page'>
        <MainPage.Body>
          <div style={{ padding: '20px', color: '#d9534f' }}>
            <p><strong>{t('Error loading collections:')}</strong></p>
            <p>{error.message}</p>
          </div>
        </MainPage.Body>
      </MainPage>
    );
  }

  if (collections.length === 0) {
    return (
      <MainPage id='browse-collections-page'>
        <MainPage.Body>
          <div style={{ padding: '20px', textAlign: 'center' }}>
            <p>{t('No collections found for this game.')}</p>
          </div>
        </MainPage.Body>
      </MainPage>
    );
  }

  return (
    <MainPage id='browse-collections-page'>
      <MainPage.Body>
        <div style={{
          height: '100%',
          overflow: 'auto',
          padding: '20px',
        }}>
          <h2>{t('Browse Collections')}</h2>

          {/* Search Bar */}
          <div style={{
            display: 'flex',
            gap: '10px',
            marginBottom: '15px',
          }}>
            <input
              type="text"
              placeholder={t('Search collections...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: '4px',
                border: '1px solid #444',
                backgroundColor: '#2a2a2a',
                color: '#ccc',
                fontSize: '14px',
              }}
            />
            <button
              onClick={handleSearch}
              style={{
                padding: '8px 20px',
                borderRadius: '4px',
                border: '1px solid #444',
                backgroundColor: '#3a3a3a',
                color: '#ccc',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 'bold',
              }}
            >
              {t('Search')}
            </button>
          </div>

          {/* Results count and sort */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
          }}>
            <p style={{ color: '#888', margin: 0 }}>
              {t('Showing {{showing}} of {{total}} collections', {
                showing: collections.length,
                total: totalCount,
              })}
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <label htmlFor="sort-select" style={{ color: '#888' }}>
                {t('Sort by:')}
              </label>
              <select
                id="sort-select"
                value={SORT_OPTIONS.indexOf(sortBy)}
                onChange={(e) => setSortBy(SORT_OPTIONS[parseInt(e.target.value, 10)])}
                style={{
                  padding: '5px 10px',
                  borderRadius: '4px',
                  border: '1px solid #444',
                  backgroundColor: '#2a2a2a',
                  color: '#ccc',
                  cursor: 'pointer',
                }}
              >
                {SORT_OPTIONS.map((option, index) => (
                  <option key={option.field} value={index}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))',
            gap: '15px',
          }}>
            {collections.map((collection) => (
              <div
                key={collection.id}
                style={{
                  border: '1px solid #444',
                  borderRadius: '4px',
                  backgroundColor: '#2a2a2a',
                  display: 'flex',
                  overflow: 'hidden',
                  height: '190px',
                }}
              >
                {/* Left column - Portrait Image */}
                <div style={{
                  flexShrink: 0,
                  width: '120px',
                  backgroundColor: '#1a1a1a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  {(collection as any).tileImage?.thumbnailUrl ? (
                    <img
                      src={(collection as any).tileImage.thumbnailUrl}
                      alt={collection.name}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
                    />
                  ) : (
                    <div style={{ color: '#666', fontSize: '11px', textAlign: 'center', padding: '10px' }}>
                      No Image
                    </div>
                  )}
                </div>

                {/* Right column - Metadata */}
                <div style={{
                  flex: 1,
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                }}>
                  <div style={{ marginBottom: '8px' }}>
                    <h3 style={{
                      fontSize: '14px',
                      fontWeight: 'bold',
                      margin: '0 0 2px 0',
                      color: '#fff',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      lineHeight: '1.3',
                    }}>
                      {collection.name}
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                      {collection.user?.avatar && (
                        <img
                          src={collection.user.avatar}
                          alt={collection.user?.name || 'User'}
                          style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '50%',
                            objectFit: 'cover',
                          }}
                        />
                      )}
                      <p style={{ fontSize: '11px', color: '#aaa', margin: 0 }}>
                        by {collection.user?.name || 'Unknown'}
                      </p>
                    </div>
                  </div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '4px 10px',
                    fontSize: '11px',
                    color: '#bbb',
                    flex: 1,
                  }}>
                    {(collection as any).totalDownloads !== undefined && (
                      <div>
                        <strong>Downloads:</strong> {formatNumber((collection as any).totalDownloads)}
                      </div>
                    )}
                    {collection.endorsements !== undefined && (
                      <div>
                        <strong>Endorsements:</strong> {formatNumber(collection.endorsements)}
                      </div>
                    )}
                    {(collection as any).latestPublishedRevision && (
                      <>
                        <div>
                          <strong>Mods:</strong> {(collection as any).latestPublishedRevision.modCount}
                        </div>
                        <div>
                          <strong>Size:</strong> {formatFileSize((collection as any).latestPublishedRevision.totalSize)}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div style={{
                    display: 'flex',
                    gap: '8px',
                    marginTop: '8px',
                  }}>
                    <button
                      onClick={() => handleAddCollection(collection)}
                      style={{
                        flex: 1,
                        padding: '6px 12px',
                        borderRadius: '4px',
                        border: '1px solid #d87d00',
                        backgroundColor: '#d87d00',
                        color: '#fff',
                        cursor: 'pointer',
                        fontSize: '11px',
                        fontWeight: 'bold',
                      }}
                    >
                      Add Collection
                    </button>
                    <button
                      onClick={() => handleViewOnNexus(collection)}
                      style={{
                        flex: 1,
                        padding: '6px 12px',
                        borderRadius: '4px',
                        border: '1px solid #444',
                        backgroundColor: '#3a3a3a',
                        color: '#ccc',
                        cursor: 'pointer',
                        fontSize: '11px',
                        fontWeight: 'bold',
                      }}
                    >
                      View on Nexus Mods
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </MainPage.Body>
    </MainPage>
  );
}

export default BrowseCollections;
