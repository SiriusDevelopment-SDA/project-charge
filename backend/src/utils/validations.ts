// import {
//     ValidatorConstraint,
//     ValidatorConstraintInterface,
//     ValidationArguments,
//   } from 'class-validator';
  
//   @ValidatorConstraint({ name: 'NameOrNumero', async: false })
//   export class NameOrNumeroValidator
//     implements ValidatorConstraintInterface {
  
//     validate(_: any, args: ValidationArguments) {
//       const { name, numero } = args.object as any;
//       return !!name || !!numero;
//     }
  
//     defaultMessage() {
//       return 'Informe nome ou numero';
//     }
//   }
  