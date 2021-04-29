import I18next from 'i18next';
import * as React from 'react';
import { ControlLabel, ListGroup, ListGroupItem } from 'react-bootstrap';
import { ComponentEx, Toggle, types, util } from 'vortex-api';
import { ICollectionModRule, ICollectionModRuleEx } from '../types/ICollection';
import { renderReference, ruleId } from '../util/util';

export interface IModsPageProps {
  t: I18next.TFunction;
  collection: types.IMod;
  mods: { [modId: string]: types.IMod };
  rules: ICollectionModRule[];
  onSetCollectionAttribute: (path: string[], value: any) => void;
}

interface IModsPageState {
}

type IProps = IModsPageProps;

class ModRulesPage extends ComponentEx<IProps, IModsPageState> {
  constructor(props: IProps) {
    super(props);

    this.initState({
    });
  }

  public render(): React.ReactNode {
    const { t, collection, rules } = this.props;

    const filtered = rules.filter(rule => !util.testModReference(collection, rule.source));

    let lastSourceName: string;

    return (
      <div id='collection-mod-rules'>
        <ControlLabel>
          <p>
            {t('By default the collection will replicate all your custom rules that dictate '
               + 'the deployment order of mods.')}
            &nbsp;
            {t('If you disable rules here your collection may produce unresolved file conflicts '
               + 'that the user has to resolve.')}
          </p>
        </ControlLabel>
        <ListGroup>
          {filtered
            .map(rule => this.insertNames(rule))
            .sort(this.ruleSort)
            .map((rule, idx) => {
              const separator: boolean = rule.sourceName !== lastSourceName;
              lastSourceName = rule.sourceName;
              return this.renderRule(rule, idx, separator);
            })}
        </ListGroup>
      </div>
    );
  }

  private insertNames(rule: ICollectionModRule): ICollectionModRuleEx {
    return {
      ...rule,
      sourceName: renderReference(rule.source, this.props.mods),
      referenceName: renderReference(rule.reference, this.props.mods),
    };
  }

  private ruleSort = (lhs: ICollectionModRuleEx, rhs: ICollectionModRuleEx) => {
    return lhs.sourceName.localeCompare(rhs.sourceName);
  }

  private renderRule(rule: ICollectionModRuleEx, idx: number, separator: boolean): JSX.Element {
    const { collection } = this.props;

    // md5-hashing to prevent excessive id names and special characters as a key
    // in application state
    const id = ruleId(rule);

    const checked = collection.attributes?.collection?.rule?.[id] ?? true;

    return (
      <ListGroupItem className={separator ? 'collection-rule-separator' : undefined} key={idx.toString()}>
        <Toggle checked={checked} dataId={id} onToggle={this.toggleRule}>
          <div className='rule-name'>{rule.sourceName}</div>
          <div className='rule-type'>{rule.type}</div>
          <div className='rule-name'>{rule.referenceName}</div>
        </Toggle>
      </ListGroupItem>
    );
  }

  private toggleRule = (newValue: boolean, dataId: string) => {
    const { onSetCollectionAttribute } = this.props;
    onSetCollectionAttribute(['rule', dataId], newValue);
  }
}

export default ModRulesPage;
