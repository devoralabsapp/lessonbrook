import "server-only";
import { vietnamToday } from "@/domain";
import { addBusinessDays } from "@/domain/statements";
import { weekdays } from "@/domain/classes";

const names = [
  "Alex Rivera",
  "Bảo An",
  "Camila Reed",
  "Chi Mai",
  "Đức Long",
  "Emma Brooks",
  "Gia Bảo",
  "Hà Linh",
  "Isabel Park",
  "Jamie Flores",
  "Khánh Vy",
  "Lam Anh",
  "Leo Chen",
  "Mai Anh",
  "Minh Khang",
  "Naomi Cruz",
  "Nhi Phan",
  "Noah Silva",
  "Olivia Nguyen",
  "Phúc An",
  "Quỳnh Anh",
  "Riley Kim",
  "Sofia Tran",
  "Tâm An",
  "Thanh Bình",
  "Thiên Ân",
  "Tú Anh",
  "Valerie Shaw",
  "Vân Anh",
  "Yến Chi",
  "An Nhiên",
  "Bình Minh",
  "Carter Green",
  "Daisy Wong",
  "Eli Brown",
  "Hải Đăng",
  "Hana Martin",
  "Jade Lin",
  "Kiều Oanh",
  "Luca Rossi",
  "My Linh",
  "Ngọc Minh",
  "Sam Wilson",
  "Trúc Anh",
  "Zoe Patel",
];

const classNames = [
  "Piano cơ bản",
  "Piano nâng cao",
  "Tiếng Anh giao tiếp",
  "Tiếng Anh thiếu nhi",
  "Toán lớp 6",
  "Toán lớp 9",
  "Guitar acoustic",
  "Nhạc lý",
  "Luyện phát âm",
  "Viết sáng tạo",
];

const paymentStates = [
  "paid",
  "partial",
  "unpaid",
  "overdue",
  "draft",
  "paid",
  "partial",
  "unpaid",
  "overdue",
  "void",
  "paid",
  "partial",
  "unpaid",
  "paid",
  "paid",
] as const;

export function createDemoData(today = vietnamToday()) {
  const students = names.map((name, index) => ({
    id: index + 1,
    name,
    archived: index >= 43,
  }));
  const classes = classNames.map((name, index) => ({
    id: index + 1,
    name,
    students: students.filter(
      (_, studentIndex) => studentIndex % classNames.length === index,
    ),
    archived: index === 9,
    schedule:
      index === 9
        ? []
        : [
            {
              day: weekdays[index % 7],
              time: index % 2 === 0 ? "18:00" : "19:30",
            },
            ...(index % 3 === 0
              ? [{ day: weekdays[(index + 2) % 7], time: "18:00" }]
              : []),
          ],
  }));
  const lessons = Array.from({ length: 30 }, (_, index) => {
    const teachingClass = classes[index < 10 ? index : index % 9];
    const type =
      index < 10 || (index >= 24 && index <= 25)
        ? "class"
        : index < 15
          ? "group"
          : "individual";
    const participants =
      type === "class"
        ? teachingClass.students
        : type === "group"
          ? [students[index], students[index + 10], students[index + 20]]
          : [students[index - 15]];
    const status =
      index >= 26 ? "cancelled" : index >= 23 ? "planned" : "completed";
    return {
      id: index + 1,
      type,
      className: type === "class" ? teachingClass.name : null,
      students: participants,
      date: addBusinessDays(
        today,
        status === "planned" ? index - 22 : -Math.min(index + 1, 20),
      ),
      time: index % 2 ? "19:30" : "18:00",
      durationMinutes: index % 3 ? 60 : 45,
      status,
      rate:
        status === "completed" && index < 20 ? 150000 + (index % 4) * 50000 : 0,
    } as const;
  });
  const statements = paymentStates.map((status, index) => {
    const lesson = lessons[index];
    const student = lesson.students[0];
    const items = index < 5 ? [lesson, lessons[15 + index]] : [lesson];
    const total = items.reduce((sum, item) => sum + item.rate, 0);
    const amount =
      status === "paid" ? total : status === "partial" ? total / 2 : 0;
    const payments = amount
      ? [
          {
            amount: index === 0 ? amount / 2 : amount,
            date: addBusinessDays(today, -1),
            method: index % 2 ? "cash" : "transfer",
          },
          ...(index === 0
            ? [{ amount: amount / 2, date: today, method: "cash" }]
            : []),
        ]
      : [];
    return {
      number: `DEMO-${String(index + 1).padStart(3, "0")}`,
      status,
      student,
      items,
      total,
      paid: amount,
      due: addBusinessDays(today, status === "overdue" ? -2 : 5),
      payments,
    };
  });
  return { students, classes, lessons, statements };
}

export type DemoData = ReturnType<typeof createDemoData>;
