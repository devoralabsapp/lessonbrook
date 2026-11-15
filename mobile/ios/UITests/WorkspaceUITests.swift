import XCTest

final class WorkspaceUITests: XCTestCase {
    @MainActor
    func testDemoUsesSwiftUIForDirectoriesCalendarsAndForms() {
        let app = XCUIApplication()
        app.launchArguments = ["-workspace.locale", "en"]
        app.launch()
        let demo = app.buttons["View demo"]
        XCTAssertTrue(demo.waitForExistence(timeout: 20))
        demo.tap()
        let students = app.buttons["workspace-tab-students"]
        XCTAssertTrue(students.waitForExistence(timeout: 20))
        students.tap()
        let add = app.buttons["Add student"]
        XCTAssertTrue(add.waitForExistence(timeout: 20))
        XCTAssertEqual(app.webViews.count, 0)

        add.tap()
        let name = app.textFields["Student name"]
        XCTAssertTrue(name.waitForExistence(timeout: 10))
        capture("Add student", app: app)
        name.tap()
        name.typeText("Native QA Student")
        let email = app.textFields["Statement email"]
        email.tap()
        email.typeText("qa@example.test")
        tapVisible(app.buttons["Save"], app: app)
        XCTAssertTrue(name.waitForNonExistence(timeout: 15))
        XCTAssertTrue(add.waitForExistence(timeout: 20))
        let search = app.textFields["Search students by name"]
        search.tap()
        search.typeText("Native QA\n")
        let created = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Native QA Student")).firstMatch
        XCTAssertTrue(created.waitForExistence(timeout: 20))
        app.buttons["workspace-tab-classes"].tap()
        XCTAssertTrue(app.buttons["Month calendar"].waitForExistence(timeout: 20))
        app.buttons["Month calendar"].tap()
        XCTAssertTrue(app.buttons["Next month"].waitForExistence(timeout: 20))
        app.buttons["Next month"].tap()
        XCTAssertEqual(app.webViews.count, 0)
        app.buttons["workspace-tab-lessons"].tap()
        XCTAssertTrue(app.buttons["Record lesson"].waitForExistence(timeout: 20))
        app.buttons["Record lesson"].tap()
        XCTAssertTrue(app.staticTexts["Teach"].waitForExistence(timeout: 10))
        XCTAssertEqual(app.webViews.count, 0)
        capture("Record lesson", app: app)
        let rosterSearch = app.textFields["Search students by name"]
        XCTAssertTrue(rosterSearch.waitForExistence(timeout: 10))
        rosterSearch.tap(); rosterSearch.typeText("Native QA\n")
        let choose = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Choose a student")).firstMatch
        XCTAssertTrue(choose.waitForExistence(timeout: 10))
        choose.tap()
        let learner = app.buttons["Native QA Student"]
        XCTAssertTrue(learner.waitForExistence(timeout: 10)); learner.tap()
        tapVisible(app.buttons["Lesson date"], app: app)
        let businessDate = DateFormatter()
        businessDate.locale = Locale(identifier: "en_US_POSIX")
        businessDate.timeZone = TimeZone(identifier: "Asia/Ho_Chi_Minh")
        businessDate.dateFormat = "yyyy-MM-dd"
        let selectedDate = app.buttons[businessDate.string(from: Date())]
        XCTAssertTrue(selectedDate.waitForExistence(timeout: 10))
        XCTAssertTrue(selectedDate.isSelected)
        capture("Themed lesson date picker", app: app)
        selectedDate.tap()
        let price = app.textFields["Lesson price (VND)"]
        XCTAssertTrue(price.waitForExistence(timeout: 10)); price.tap(); price.typeText("30000")
        tapVisible(app.buttons["Save"], app: app)
        XCTAssertTrue(app.buttons["Record lesson"].waitForExistence(timeout: 15))
        app.buttons["workspace-tab-statements"].tap()
        XCTAssertTrue(app.buttons["Create statement"].waitForExistence(timeout: 15))
        app.buttons["Create statement"].tap()
        XCTAssertTrue(choose.waitForExistence(timeout: 10)); choose.tap()
        let statementSearch = app.textFields["Search students"]
        XCTAssertTrue(statementSearch.waitForExistence(timeout: 10))
        statementSearch.tap(); statementSearch.typeText("Native QA")
        XCTAssertTrue(learner.waitForExistence(timeout: 10)); learner.tap()
        let selectAll = app.buttons["Select all lessons"]
        if !selectAll.isHittable { app.swipeUp() }
        XCTAssertTrue(selectAll.waitForExistence(timeout: 10)); selectAll.tap()
        tapVisible(app.buttons["Save"], app: app)
        XCTAssertTrue(selectAll.waitForNonExistence(timeout: 15))
        XCTAssertTrue(app.buttons["Create statement"].waitForExistence(timeout: 15))
        tapVisible(app.buttons["All students"], app: app)
        XCTAssertTrue(statementSearch.waitForExistence(timeout: 10))
        statementSearch.tap(); statementSearch.typeText("Native QA")
        XCTAssertTrue(learner.waitForExistence(timeout: 10)); learner.tap()
        let tuition = app.staticTexts.matching(NSPredicate(format: "label ENDSWITH %@", "· Native QA Student")).firstMatch
        tapVisible(tuition, app: app)
        let cash = app.buttons["Paid by cash"]
        if !cash.isHittable { app.swipeUp() }
        XCTAssertTrue(cash.waitForExistence(timeout: 10)); cash.tap()
        XCTAssertTrue(app.textFields["Amount received (VND)"].waitForExistence(timeout: 10))
        tapVisible(app.buttons["Save"], app: app)
        XCTAssertTrue(app.textFields["Amount received (VND)"].waitForNonExistence(timeout: 15))
        app.swipeUp()
        app.swipeUp()
        XCTAssertTrue(app.staticTexts["Cash"].waitForExistence(timeout: 15))
        let paymentShot = XCTAttachment(screenshot: app.screenshot())
        paymentShot.name = "Native English payment history"
        paymentShot.lifetime = .keepAlways
        self.add(paymentShot)
        XCTAssertEqual(app.webViews.count, 0)
        app.buttons["workspace-tab-dashboard"].tap()
        let timings = ["students", "classes", "lessons", "statements"].map { tab -> Double in
            let started = ProcessInfo.processInfo.systemUptime
            app.buttons["workspace-tab-" + tab].tap()
            XCTAssertTrue(app.buttons["workspace-tab-" + tab].exists)
            return ProcessInfo.processInfo.systemUptime - started
        }
        print("NATIVE_TAB_XCUITEST_SECONDS \(timings)")
    }

    @MainActor
    private func capture(_ label: String, app: XCUIApplication) {
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = label
        shot.lifetime = .keepAlways
        add(shot)
    }

    @MainActor
    private func tapVisible(_ button: XCUIElement, app: XCUIApplication) {
        for _ in 0..<6 {
            if button.isHittable { button.tap(); return }
            app.swipeUp()
        }
        XCTAssertTrue(button.isHittable)
        button.tap()
    }

    @MainActor
    func testRestoredWorkspaceLayoutAndDirectActions() {
        let app = XCUIApplication()
        app.launchArguments = ["-workspace.locale", "en"]
        app.launch()
        XCTAssertTrue(app.buttons["View demo"].waitForExistence(timeout: 20))
        app.buttons["View demo"].tap()
        XCTAssertTrue(app.buttons["workspace-tab-students"].waitForExistence(timeout: 20))
        for tab in ["students", "classes", "lessons", "statements"] {
            app.buttons["workspace-tab-" + tab].tap()
            let label = tab == "students" ? "Student list" : tab == "classes" ? "Class list" : tab == "lessons" ? "Lesson list" : "Statement list"
            XCTAssertTrue(app.staticTexts[label].waitForExistence(timeout: 15))
            XCTAssertTrue(app.buttons["List"].exists)
            XCTAssertTrue(app.buttons["Notes"].exists)
            let shot = XCTAttachment(screenshot: app.screenshot())
            shot.name = "Restored English " + tab
            shot.lifetime = .keepAlways
            add(shot)
            if tab == "students" || tab == "classes" {
                tapVisible(app.buttons["Edit"].firstMatch, app: app)
                XCTAssertTrue(app.textFields[tab == "students" ? "Student name" : "Class name"].waitForExistence(timeout: 15))
                let form = XCTAttachment(screenshot: app.screenshot())
                form.name = "Restored " + tab + " editor"
                form.lifetime = .keepAlways; add(form)
                app.buttons["Cancel"].firstMatch.tap()
            }
            XCTAssertEqual(app.webViews.count, 0)
        }
        XCTAssertTrue(app.buttons["Statement status"].exists)
        XCTAssertTrue(app.buttons["Statement date"].exists)
        app.buttons["workspace-tab-lessons"].tap()
        XCTAssertTrue(app.buttons["Search by"].exists)
        XCTAssertTrue(app.buttons["Today"].exists)
        XCTAssertTrue(app.buttons["This month"].exists)
        XCTAssertTrue(app.buttons["Clear filters"].exists)
        XCTAssertTrue(app.buttons["Select"].exists)
    }

    @MainActor
    func testWorkspaceChromeWeeklyFieldsAndCalendarSelection() {
        let app = XCUIApplication()
        app.launchArguments = ["-workspace.locale", "en"]
        app.launch()
        XCTAssertTrue(app.buttons["View demo"].waitForExistence(timeout: 20))
        app.buttons["View demo"].tap()
        let dashboard = app.buttons["workspace-tab-dashboard"]
        XCTAssertTrue(dashboard.waitForExistence(timeout: 20))

        app.buttons["Account settings"].tap()
        let profile = app.staticTexts["Teacher profile"]
        XCTAssertTrue(profile.waitForExistence(timeout: 10))
        XCTAssertEqual(app.staticTexts.matching(identifier: "Account settings").count, 1)
        XCTAssertEqual(app.buttons.matching(identifier: "Back").count, 1)
        let exit = app.buttons["Exit demo"]
        for _ in 0..<6 where !exit.isHittable { app.swipeUp() }
        XCTAssertTrue(exit.isHittable)
        XCTAssertLessThanOrEqual(exit.frame.maxY, dashboard.frame.minY)
        let signIn = app.buttons.matching(NSPredicate(format: "label == %@ AND identifier != %@", "Sign in", "workspace-demo-sign-in")).firstMatch
        XCTAssertEqual(exit.frame.midY, signIn.frame.midY, accuracy: 2)
        app.buttons["Back"].tap()

        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "Asia/Ho_Chi_Minh")
        formatter.dateFormat = "yyyy-MM-dd"
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = formatter.timeZone
        let date = Date()
        let dayOfWeek = calendar.component(.weekday, from: date)
        let day = calendar.component(.day, from: date)
        let monthLength = calendar.range(of: .day, in: .month, for: date)!.count
        let offset = dayOfWeek != 1 && day < monthLength ? 1 : -1
        let neighborDate = calendar.date(byAdding: .day, value: offset, to: date)!
        let today = app.buttons["calendar-day-" + formatter.string(from: date)]
        let neighbor = app.buttons["calendar-day-" + formatter.string(from: neighborDate)]
        for tab in ["students", "classes", "lessons", "statements"] {
            app.buttons["workspace-tab-" + tab].tap()
            let scroll = app.scrollViews.firstMatch
            XCTAssertTrue(scroll.waitForExistence(timeout: 10))
            XCTAssertLessThanOrEqual(scroll.frame.maxY, dashboard.frame.minY)
            if tab == "classes" {
                app.buttons["Add class"].tap()
                XCTAssertTrue(app.textFields["Class name"].waitForExistence(timeout: 10))
                capture("Add class", app: app)
                tapVisible(app.buttons["Add weekly time"], app: app)
                let day = app.buttons["Day"].firstMatch
                let time = app.buttons["Start time"].firstMatch
                XCTAssertTrue(day.waitForExistence(timeout: 10))
                XCTAssertTrue(time.exists)
                XCTAssertEqual(day.frame.midY, time.frame.midY, accuracy: 2)
                tapVisible(time, app: app)
                let hour = app.buttons["workspace-clock-hour-19"]
                let minute = app.buttons["workspace-clock-minute-1"]
                XCTAssertTrue(hour.waitForExistence(timeout: 10))
                hour.tap()
                minute.tap()
                capture("Themed weekly time picker", app: app)
                app.buttons["Done"].tap()
                XCTAssertEqual(time.value as? String, "19:01")
                app.buttons["Cancel"].firstMatch.tap()
                app.buttons["Discard changes"].tap()
            }
            if tab == "classes" || tab == "lessons" {
                let calendar = app.buttons["Month calendar"]
                XCTAssertTrue(calendar.waitForExistence(timeout: 10))
                for _ in 0..<4 where !calendar.isHittable { app.swipeDown() }
                calendar.tap()
                XCTAssertTrue(app.staticTexts["workspace-calendar-month"].waitForExistence(timeout: 10))
                XCTAssertFalse(app.buttons["This month"].exists)
                for _ in 0..<6 where !today.isHittable { app.swipeUp() }
                XCTAssertTrue(today.isHittable)
                XCTAssertTrue(today.isSelected)
                XCTAssertTrue(app.staticTexts["calendar-agenda-title"].exists)
                let shot = XCTAttachment(screenshot: app.screenshot())
                shot.name = "Highlighted current day in " + tab
                shot.lifetime = .keepAlways
                add(shot)
                if day != 1 || offset > 0, dayOfWeek != 2 || offset > 0 {
                    XCTAssertEqual(today.frame.width, neighbor.frame.width, accuracy: 1)
                    XCTAssertEqual(today.frame.height, neighbor.frame.height, accuracy: 1)
                    XCTAssertEqual(today.frame.minY, neighbor.frame.minY, accuracy: 1)
                    let gap = offset > 0 ? neighbor.frame.minX - today.frame.maxX : today.frame.minX - neighbor.frame.maxX
                    XCTAssertLessThanOrEqual(abs(gap), 1)
                    neighbor.tap()
                    XCTAssertTrue(neighbor.isSelected)
                    XCTAssertFalse(today.isSelected)
                }
            }
        }
    }

    @MainActor
    func testWebViewListActionsClassDetailsAndUpcomingLessons() {
        let app = XCUIApplication()
        app.launchArguments = ["-workspace.locale", "en"]
        app.launch()
        XCTAssertTrue(app.buttons["View demo"].waitForExistence(timeout: 20))
        app.buttons["View demo"].tap()
        XCTAssertTrue(app.buttons["workspace-tab-dashboard"].waitForExistence(timeout: 20))

        let identity = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "ledger-person-")).firstMatch
        for tab in ["students", "classes"] {
            app.buttons["workspace-tab-" + tab].tap()
            XCTAssertFalse(app.buttons["Back"].exists)
            let list = app.buttons["List"]
            XCTAssertTrue(list.waitForExistence(timeout: 10))
            list.tap()
            XCTAssertTrue(identity.waitForExistence(timeout: 15))
            let edit = app.buttons["Edit"].firstMatch
            let archive = app.buttons["Archive"].firstMatch
            XCTAssertTrue(archive.waitForExistence(timeout: 10))
            XCTAssertGreaterThan(edit.frame.midX, identity.frame.midX)
            XCTAssertGreaterThan(archive.frame.midX, edit.frame.midX)
            XCTAssertEqual(edit.frame.midY, archive.frame.midY, accuracy: 2)
            XCTAssertEqual(edit.frame.midY, identity.frame.midY, accuracy: 2)
            capture("List actions in " + tab, app: app)
        }

        identity.tap()
        XCTAssertTrue(app.buttons["Edit class"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["Record lesson for class"].exists)
        XCTAssertTrue(app.staticTexts["Weekly schedule"].exists)
        XCTAssertTrue(app.staticTexts["Students in this class"].exists)
        XCTAssertEqual(app.buttons.matching(identifier: "Back").count, 1)
        capture("Class detail", app: app)
        let classLesson = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "class-lesson-")).firstMatch
        XCTAssertTrue(classLesson.waitForExistence(timeout: 10))
        tapVisible(app.buttons["View all lessons"], app: app)
        XCTAssertTrue(app.staticTexts["Lesson list"].waitForExistence(timeout: 10))

        app.buttons["workspace-tab-lessons"].tap()
        XCTAssertFalse(app.buttons["Back"].exists)
        app.buttons["Upcoming lessons"].tap()
        XCTAssertTrue(app.staticTexts["upcoming-date-range"].waitForExistence(timeout: 15))
        let lessons = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "upcoming-lesson-"))
        XCTAssertGreaterThan(lessons.count, 8)
        capture("Upcoming lessons", app: app)
        let weekly = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "upcoming-lesson-/app/lessons/new")).firstMatch
        tapVisible(weekly, app: app)
        XCTAssertTrue(app.staticTexts["Teach"].waitForExistence(timeout: 10))
    }

    @MainActor
    func testClassAndCustomGroupCanSelectActiveStudents() {
        let app = XCUIApplication()
        app.launchArguments = ["-workspace.locale", "en"]
        app.launch()
        XCTAssertTrue(app.buttons["View demo"].waitForExistence(timeout: 20))
        app.buttons["View demo"].tap()
        let classes = app.buttons["workspace-tab-classes"]
        XCTAssertTrue(classes.waitForExistence(timeout: 20))
        classes.tap()

        func findStudent(_ name: String) -> XCUIElement {
            let scroll = app.scrollViews.firstMatch
            let search = app.textFields["Search students"]
            XCTAssertTrue(search.waitForExistence(timeout: 10))
            if !search.isHittable { scroll.swipeUp(velocity: .slow) }
            search.tap()
            search.typeText(name + "\n")
            let student = app.switches[name].firstMatch
            if !student.isHittable { scroll.swipeUp(velocity: .slow) }
            XCTAssertTrue(student.waitForExistence(timeout: 15))
            XCTAssertTrue(student.isHittable)
            return student
        }

        app.buttons["Add class"].tap()
        let addMember = findStudent("Alex Rivera")
        let addValue = addMember.value as? String
        addMember.tap()
        XCTAssertNotEqual(addMember.value as? String, addValue)
        app.scrollViews.firstMatch.swipeDown()
        app.buttons["Cancel"].firstMatch.tap()
        app.buttons["Discard changes"].tap()
        let editorSearch = app.textFields["Search students"]
        XCTAssertTrue(editorSearch.waitForNonExistence(timeout: 10))

        let edit = app.buttons["Edit"].firstMatch
        XCTAssertTrue(edit.waitForExistence(timeout: 10))
        edit.tap()
        let editMember = findStudent("Alex Rivera")
        XCTAssertTrue(editMember.isEnabled)
        app.scrollViews.firstMatch.swipeDown()
        app.buttons["Cancel"].firstMatch.tap()
        XCTAssertTrue(editorSearch.waitForNonExistence(timeout: 10))

        app.buttons["workspace-tab-lessons"].tap()
        app.buttons["Record lesson"].tap()
        app.buttons["Teach"].tap()
        let teach = app.scrollViews["workspace-option-panel"]
        XCTAssertTrue(teach.waitForExistence(timeout: 10))
        XCTAssertTrue(teach.buttons["One student"].isSelected)
        teach.buttons["Custom student group"].tap()
        let participant = findStudent("Alex Rivera")
        let participantValue = participant.value as? String
        participant.tap()
        XCTAssertNotEqual(participant.value as? String, participantValue)
    }

    @MainActor
    func testAllThemesAndVietnameseUseNativeScreens() {
        let app = XCUIApplication()
        app.launchArguments = ["-workspace.locale", "vi"]
        app.launch()
        XCTAssertTrue(app.buttons["Xem demo"].waitForExistence(timeout: 20))
        app.buttons["Xem demo"].tap()
        XCTAssertTrue(app.buttons["workspace-tab-dashboard"].waitForExistence(timeout: 20))
        for theme in ["Mono OS", "Chapter Desk", "Afterhours FM", "Margin Notes", "Sticker Sprint", "Playful Retro Neo-Brutalism"] {
            let palette = app.buttons["Chọn theme"]
            XCTAssertTrue(palette.waitForExistence(timeout: 10))
            palette.tap()
            let choice = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", theme)).firstMatch
            if !choice.isHittable { app.swipeUp() }
            XCTAssertTrue(choice.waitForExistence(timeout: 10))
            choice.tap()
            app.swipeUp()
            let save = app.buttons["Lưu giao diện"]
            XCTAssertTrue(save.waitForExistence(timeout: 10))
            save.tap()
            XCTAssertTrue(save.waitForNonExistence(timeout: 15))
            XCTAssertTrue(palette.waitForExistence(timeout: 10))
            app.buttons["workspace-tab-students"].tap()
            let status = app.buttons["Trạng thái"]
            XCTAssertTrue(status.waitForExistence(timeout: 10))
            XCTAssertEqual(app.webViews.count, 0)
            let screenshot = XCTAttachment(screenshot: app.screenshot())
            screenshot.name = "Native Vietnamese " + theme
            screenshot.lifetime = .keepAlways
            add(screenshot)
            status.tap()
            let active = app.buttons["Đang hoạt động"]
            XCTAssertTrue(active.waitForExistence(timeout: 10))
            XCTAssertTrue(active.isSelected)
            XCTAssertTrue(app.buttons["Đã lưu trữ"].exists)
            let options = XCTAttachment(screenshot: app.screenshot())
            options.name = "Native dropdown " + theme
            options.lifetime = .keepAlways
            add(options)
            active.tap()
            if theme == "Afterhours FM" || theme == "Playful Retro Neo-Brutalism" {
                XCTAssertTrue(active.waitForNonExistence(timeout: 10))
                app.buttons["Thêm học viên"].tap()
                let name = app.textFields["Tên học viên"]
                XCTAssertTrue(name.waitForExistence(timeout: 10))
                capture("Vietnamese Add student — " + theme, app: app)
                app.buttons["Hủy"].firstMatch.tap()
                XCTAssertTrue(name.waitForNonExistence(timeout: 10))
            }
        }
    }
}
