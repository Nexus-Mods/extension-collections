import I18next from 'i18next';
import * as React from 'react';
import { ControlLabel, ListGroup, ListGroupItem } from 'react-bootstrap';
import { ComponentEx, Toggle, types, util } from 'vortex-api';
import { IModPackModRule } from '../types/IModPack';
import { findModByRef } from '../util/findModByRef';

export interface IModsPageProps {
  t: I18next.TFunction;
  modpack: types.IMod;
  mods: { [modId: string]: types.IMod };
  rules: IModPackModRule[];
}

interface IModsPageState {
}

type IProps = IModsPageProps;

interface IModPackModRuleEx extends IModPackModRule {
  sourceName: string;
  referenceName: string;
}

class ModRulesPage extends ComponentEx<IProps, IModsPageState> {
  constructor(props: IProps) {
    super(props);

    this.initState({
    });
  }

  public componentWillReceiveProps(newProps: IProps) {
    if (newProps.mods !== this.props.mods) {
      // nop
    }
  }

  public render(): React.ReactNode {
    const { t, modpack, rules } = this.props;

    const filtered = rules.filter(rule => !util.testModReference(modpack, rule.source));

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

  private insertNames(rule: IModPackModRule): IModPackModRuleEx {
    return {
      ...rule,
      sourceName: this.renderReference(rule.source),
      referenceName: this.renderReference(rule.reference),
    };
  }

  private ruleSort = (lhs: IModPackModRuleEx, rhs: IModPackModRuleEx) => {
    return lhs.sourceName.localeCompare(rhs.sourceName);
  }

  private renderRule(rule: IModPackModRuleEx, idx: number, separator: boolean): JSX.Element {
    return (
      <ListGroupItem className={separator ? 'collection-rule-separator' : undefined} key={idx.toString()}>
        <Toggle checked={true} dataId={'foobar'} onToggle={this.toggleRule}>
          <div className='rule-name'>{rule.sourceName}</div>
          <div className='rule-type'>{rule.type}</div>
          <div className='rule-name'>{rule.referenceName}</div>
        </Toggle>
      </ListGroupItem>
    );
  }

  private toggleRule = (newValue: boolean, dataId: string) => {
    // nop
  }

  private renderReference(ref: types.IModReference): string {
    const mod = findModByRef(ref, this.props.mods);
    return (util as any).renderModReference(ref, mod);
  }
}

export default ModRulesPage;
