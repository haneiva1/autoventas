import { decideContract, ContractState } from './commerce-contract.js';

export function runContractDebug(params: {
  messageText: string;
  state: ContractState;
}) {
  const decision = decideContract({
    messageText: params.messageText,
    state: params.state,
  });

  console.log('[CONTRACT] input:', {
    text: params.messageText,
    state: params.state,
  });

  console.log('[CONTRACT] decision:', decision);

  return decision;
}
