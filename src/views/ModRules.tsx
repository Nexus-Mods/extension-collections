import I18next from 'i18next';
import * as React from 'react';
import { ControlLabel, ListGroup, ListGroupItem } from 'react-bootstrap';
import { ComponentEx, Toggle, types, util } from 'vortex-api';
import { IModPackModRule } from '../types/IModPack';
import findModByRef from '../util/findModByRef';

export interface IModsPageProps {
  t: I18next.TFunction;
  modpack: types.IMod;
  mods: { [modId: string]: types.IMod };
  rules: IModPackModRule[];
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

  public componentWillReceiveProps(newProps: IProps) {
    if (newProps.mods !== this.props.mods) {
      // nop
    }
  }

  public render(): React.ReactNode {
    const { t, modpack, rules } = this.props;

    const filtered = rules.filter(rule => !util.testModReference(modpack, rule.source));

    return (
      <div>
        <ControlLabel>
          <p>
            {t('By default the modpack will replicate all your custom rules dictate '
               + 'the deployment order of mods.')}
            &nbsp;
            {t('If you disable rules here your modpack may produce unresolved file conflicts '
               + 'that the user has to resolve.')}
          </p>
        </ControlLabel>
        <ListGroup>
          {filtered.map((rule, idx) => this.renderRule(rule, idx))}
        </ListGroup>
      </div>
    );
  }

  private renderRule(rule: IModPackModRule, idx: number): JSX.Element {
    return (
      <ListGroupItem key={idx.toString()}>
        <Toggle checked={true} dataId={'foobar'} onToggle={this.toggleRule}>
          "{this.renderReference(rule.source)}"
          {' '}
          <em>{rule.type}</em>
          {' '}
          "{this.renderReference(rule.reference)}"
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
