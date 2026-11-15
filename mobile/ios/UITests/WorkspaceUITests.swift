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
        name.tap()
        name.typeText("Native QA Student")
        let email = app.textFields["Email"]
        email.tap()
        email.typeText("qa@example.test")
        app.buttons["Save"].tap()
        XCTAssertTrue(add.waitForExistence(timeout: 20))
        let search = app.textFields["Search students"]
        search.tap()
        search.typeText("Native QA")
        XCTAssertTrue(app.staticTexts["Native QA Student"].waitForExistence(timeout: 20))
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
        let choose = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Choose a student")).firstMatch
        XCTAssertTrue(choose.waitForExistence(timeout: 10))
        choose.tap()
        let learnerSearch = app.searchFields.firstMatch
        XCTAssertTrue(learnerSearch.waitForExistence(timeout: 10))
        learnerSearch.tap(); learnerSearch.typeText("Native QA")
        let learner = app.buttons["Native QA Student"]
        XCTAssertTrue(learner.waitForExistence(timeout: 10)); learner.tap()
        let price = app.textFields["Lesson price (VND)"]
        XCTAssertTrue(price.waitForExistence(timeout: 10)); price.tap(); price.typeText("30000")
        app.buttons["Save"].tap()
        XCTAssertTrue(app.buttons["Record lesson"].waitForExistence(timeout: 15))
        app.buttons["workspace-tab-statements"].tap()
        XCTAssertTrue(app.buttons["Create statement"].waitForExistence(timeout: 15))
        app.buttons["Create statement"].tap()
        XCTAssertTrue(choose.waitForExistence(timeout: 10)); choose.tap()
        let statementSearch = app.searchFields.firstMatch
        XCTAssertTrue(statementSearch.waitForExistence(timeout: 10))
        statementSearch.tap(); statementSearch.typeText("Native QA")
        XCTAssertTrue(learner.waitForExistence(timeout: 10)); learner.tap()
        let selectAll = app.buttons["Select all lessons"]
        if !selectAll.isHittable { app.swipeUp() }
        XCTAssertTrue(selectAll.waitForExistence(timeout: 10)); selectAll.tap()
        app.buttons["Save"].tap()
        XCTAssertTrue(app.buttons["Create statement"].waitForExistence(timeout: 15))
        let tuition = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Native QA Student")).firstMatch
        if !tuition.isHittable { app.swipeUp() }
        XCTAssertTrue(tuition.waitForExistence(timeout: 15)); tuition.tap()
        let cash = app.buttons["Paid by cash"]
        if !cash.isHittable { app.swipeUp() }
        XCTAssertTrue(cash.waitForExistence(timeout: 10)); cash.tap()
        XCTAssertTrue(app.textFields["Amount received (VND)"].waitForExistence(timeout: 10))
        app.buttons["Save"].tap()
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
            XCTAssertTrue(palette.waitForExistence(timeout: 10))
            app.buttons["workspace-tab-students"].tap()
            XCTAssertEqual(app.webViews.count, 0)
            let screenshot = XCTAttachment(screenshot: app.screenshot())
            screenshot.name = "Native Vietnamese " + theme
            screenshot.lifetime = .keepAlways
            add(screenshot)
        }
    }
}
