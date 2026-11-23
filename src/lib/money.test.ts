import {
  addEth,
  compareEth,
  eqEth,
  formatEth,
  gtEth,
  isEthAmount,
  isZeroEth,
  ltEth,
  maxEth,
  minEth,
  MoneyError,
  mulEth,
  normalizeEth,
  percentOfEth,
  subEth,
  subEthClamped,
} from './money'

describe('isEthAmount', () => {
  it.each(['0', '1', '1.19', '0.016', '26.846', '0.000000000000000001', '123456789.123456789123456789'])(
    'accepts %s',
    (value) => expect(isEthAmount(value)).toBe(true),
  )

  it.each(['', '-1', '-0.5', '01', '1.', '.5', '1e3', '1,19', ' 1', 'NaN', 'Infinity', '0x10', '0.0000000000000000001'])(
    'rejects %j',
    (value) => expect(isEthAmount(value)).toBe(false),
  )

  it('rejects non-strings including JS numbers', () => {
    expect(isEthAmount(1.19)).toBe(false)
    expect(isEthAmount(null)).toBe(false)
    expect(isEthAmount(undefined)).toBe(false)
  })
})

describe('arithmetic', () => {
  it('adds without floating point error (0.1 + 0.2)', () => {
    expect(0.1 + 0.2).not.toBe(0.3) // the bug this module exists to avoid
    expect(addEth('0.1', '0.2')).toBe('0.3')
  })

  it('sums many amounts and returns canonical strings', () => {
    expect(addEth('2.38', '8.34', '16.11')).toBe('26.83')
    expect(addEth('26.83', '0.016')).toBe('26.846')
    expect(addEth()).toBe('0')
    expect(addEth('1.10', '0.90')).toBe('2')
  })

  it('keeps full wei precision', () => {
    expect(addEth('0.000000000000000001', '0.000000000000000002')).toBe('0.000000000000000003')
    expect(addEth('1000000000', '0.000000000000000001')).toBe('1000000000.000000000000000001')
  })

  it('subtracts and guards against negative results', () => {
    expect(subEth('1.19', '0.19')).toBe('1')
    expect(subEth('0.3', '0.1')).toBe('0.2')
    expect(() => subEth('0.1', '0.2')).toThrow(MoneyError)
    expect(subEthClamped('0.1', '0.2')).toBe('0')
    expect(subEthClamped('0.3', '0.1')).toBe('0.2')
  })

  it('multiplies by integer quantities only', () => {
    expect(mulEth('1.19', 2)).toBe('2.38')
    expect(mulEth('1.39', 6)).toBe('8.34')
    expect(mulEth('1.79', 9)).toBe('16.11')
    expect(mulEth('1.19', 0)).toBe('0')
    expect(() => mulEth('1.19', 1.5)).toThrow(MoneyError)
    expect(() => mulEth('1.19', -1)).toThrow(MoneyError)
    expect(() => mulEth('1.19', Number.NaN)).toThrow(MoneyError)
  })

  it('computes percent discounts rounded half-up to 18 decimals', () => {
    expect(percentOfEth('26.83', '10')).toBe('2.683')
    expect(percentOfEth('1', '12.5')).toBe('0.125')
    expect(percentOfEth('1', '0')).toBe('0')
    expect(percentOfEth('1', '100')).toBe('1')
    // 0.000000000000000001 * 50% = 0.0000000000000000005 → rounds half-up to 1 wei
    expect(percentOfEth('0.000000000000000001', '50')).toBe('0.000000000000000001')
    // 1/3 style results are cut at 18 decimals
    expect(percentOfEth('0.000000000000000002', '33.33')).toBe('0.000000000000000001')
    expect(() => percentOfEth('1', '101')).toThrow(MoneyError)
    expect(() => percentOfEth('1', '-5')).toThrow(MoneyError)
    expect(() => percentOfEth('1', '10.123')).toThrow(MoneyError)
  })

  it('rejects invalid and negative inputs everywhere', () => {
    expect(() => addEth('-1')).toThrow(MoneyError)
    expect(() => addEth('1e2')).toThrow(MoneyError)
    // @ts-expect-error numbers are not accepted by the type either
    expect(() => addEth(0.1)).toThrow(MoneyError)
    expect(() => normalizeEth('abc')).toThrow(MoneyError)
  })
})

describe('comparison and normalization', () => {
  it('compares decimal strings numerically, not lexically', () => {
    expect(compareEth('10', '9')).toBe(1)
    expect(compareEth('0.016', '0.0160')).toBe(0)
    expect(compareEth('1.19', '1.2')).toBe(-1)
    expect(eqEth('1.190', '1.19')).toBe(true)
    expect(gtEth('2.29', '1.99')).toBe(true)
    expect(ltEth('0.39', '0.99')).toBe(true)
    expect(isZeroEth('0.000')).toBe(true)
    expect(isZeroEth('0.000000000000000001')).toBe(false)
    expect(minEth('0.02', '12.30')).toBe('0.02')
    expect(maxEth('0.02', '12.30')).toBe('12.3')
  })

  it('normalizes to canonical form', () => {
    expect(normalizeEth('1.190')).toBe('1.19')
    expect(normalizeEth('0.000')).toBe('0')
    expect(normalizeEth('12.300000000000000000')).toBe('12.3')
  })
})

describe('formatEth', () => {
  it('formats amounts like the design', () => {
    expect(formatEth('1.19')).toBe('1.19 ETH')
    expect(formatEth('26.846')).toBe('26.846 ETH')
    expect(formatEth('0.016')).toBe('0.016 ETH')
    expect(formatEth('2')).toBe('2.00 ETH')
    expect(formatEth('0')).toBe('0.00 ETH')
    expect(formatEth('12.3', { unit: false })).toBe('12.30')
  })

  it('rounds half-up to display precision', () => {
    expect(formatEth('1.23455')).toBe('1.2346 ETH')
    expect(formatEth('1.23454')).toBe('1.2345 ETH')
    expect(formatEth('0.99995')).toBe('1.00 ETH')
    expect(formatEth('1.005', { maxDecimals: 2 })).toBe('1.01 ETH')
  })

  it('shows tiny non-zero amounts as below the display precision', () => {
    expect(formatEth('0.00001')).toBe('< 0.0001 ETH')
    expect(formatEth('0.000000000000000001', { maxDecimals: 2 })).toBe('< 0.01 ETH')
  })

  it('supports full precision display', () => {
    expect(formatEth('0.000000000000000001', { minDecimals: 0, maxDecimals: 18, unit: false })).toBe(
      '0.000000000000000001',
    )
    expect(formatEth('5', { minDecimals: 0, maxDecimals: 18, unit: false })).toBe('5')
  })

  it('rejects invalid options and amounts', () => {
    expect(() => formatEth('1', { minDecimals: 3, maxDecimals: 2 })).toThrow(MoneyError)
    expect(() => formatEth('1', { maxDecimals: 19 })).toThrow(MoneyError)
    expect(() => formatEth('-1')).toThrow(MoneyError)
  })
})
