import { TranslationFunction } from 'i18next';
import { IReference } from 'modmeta-db';
import * as React from 'react';
import { ListGroup, ListGroupItem } from 'react-bootstrap';
import { ComponentEx, ITableRowAction, Table, Toggle, types, util } from 'vortex-api';
import { IModPackMod, IModPackModRule } from '../types/IModPack';

export interface IModsPageProps {
  t: TranslationFunction;
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
    const { rules } = this.props;

    return (
      <ListGroup>
        {rules.map((rule, idx) => this.renderRule(rule, idx))}
      </ListGroup>
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

  private renderReference(ref: IReference): string {
    return ref.logicalFileName || ref.fileExpression || ref.fileMD5;
  }
}

export default ModRulesPage;
