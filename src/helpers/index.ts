export function binaryToDecimal(binaryString: string): number {
  const binaryArray = binaryString.split("").reverse();
  let decimalValue = 0;

  for (let i = 0; i < binaryArray.length; i++) {
    if (binaryArray[i] === "1") {
      decimalValue += Math.pow(2, i);
    } else if (binaryArray[i] !== "0") {
      // If the input contains invalid characters
      return -1;
    }
  }

  return decimalValue;
}
