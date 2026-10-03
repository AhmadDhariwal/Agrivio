import { Pipe, PipeTransform } from '@angular/core';
import { formatAppDate, formatAppDateTime, formatAppTime } from './date-time.util';

@Pipe({
  name: 'agDate',
  standalone: true,
})
export class AppDatePipe implements PipeTransform {
  transform(value: string | Date | null | undefined): string {
    return formatAppDate(value);
  }
}

@Pipe({
  name: 'agTime',
  standalone: true,
})
export class AppTimePipe implements PipeTransform {
  transform(value: string | Date | null | undefined): string {
    return formatAppTime(value);
  }
}

@Pipe({
  name: 'agDateTime',
  standalone: true,
})
export class AppDateTimePipe implements PipeTransform {
  transform(value: string | Date | null | undefined): string {
    return formatAppDateTime(value);
  }
}
