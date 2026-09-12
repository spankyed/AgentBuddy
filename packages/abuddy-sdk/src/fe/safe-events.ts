export type ExtractEvent<
  TEvent extends { type: string },
  TType extends TEvent['type']
> = Extract<TEvent, { type: TType }>;

export const safeEvents =
  <TEvent extends { type: string }>() =>
  <
    TTypes extends
      | TEvent['type']
      | readonly TEvent['type'][]
  >(
    expected: TTypes,
    event: TEvent
  ): ExtractEvent<
    TEvent,
    TTypes extends readonly TEvent['type'][] ? TTypes[number] : TTypes
  > => {
    const expectedArr: readonly TEvent['type'][] = Array.isArray(expected)
      ? expected
      : [expected];

    if (!expectedArr.includes(event.type as TEvent['type'])) {
      throw new Error(
        `Expected type ${expectedArr.join(' | ')}, got ${event.type}`
      );
    }
    return event as any;
  };
